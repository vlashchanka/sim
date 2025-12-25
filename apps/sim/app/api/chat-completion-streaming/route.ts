import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { executeProviderRequest } from '@/providers'
import type { Message } from '@/providers/types'
import { getProviderFromModel } from '@/providers/utils'

const logger = createLogger('LocalSimAgentAPI')

/**
 * Mapping from Copilot model names to internal provider models
 */
const COPILOT_MODEL_MAPPING: Record<string, { provider: string; model: string }> = {
  'claude-4.5-opus': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-4.5-sonnet': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-4.5-haiku': { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
  'gpt-5.1-codex': { provider: 'openai', model: 'gpt-4' },
  'gpt-5.1-medium': { provider: 'openai', model: 'gpt-4' },
  'gemini-3-pro': { provider: 'google', model: 'gemini-2.5-flash-exp' },
  'openai/gpt-oss-20b': { provider: 'lmstudio', model: 'openai/gpt-oss-20b' },
}

/**
 * POST /api/chat-completion-streaming
 * Local implementation of Sim Agent API for Copilot
 * Returns SSE formatted streaming response
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const body = await req.json()

    logger.info(`[${requestId}] Received local chat-completion-streaming request`, {
      model: body.model,
      mode: body.mode,
      hasTools: !!body.tools,
      hasContexts: !!body.contexts && body.contexts.length > 0,
    })

    const { message, model, contexts, stream = true, chatId, workflowId, userId } = body

    // Get the provider and model mapping
    const modelMapping = COPILOT_MODEL_MAPPING[model] || {
      provider: getProviderFromModel(model),
      model: model,
    }

    const providerId = modelMapping.provider
    const actualModel = modelMapping.model

    logger.info(`[${requestId}] Using provider: ${providerId}, model: ${actualModel}`)

    // Build messages from contexts and message
    const messages: Message[] = []

    // Add contexts as system messages
    if (contexts && contexts.length > 0) {
      const contextContent = contexts
        .map((c: any) => {
          if (c.type === 'past_chat' && c.content) {
            return `Past conversation:\n${c.content}`
          }
          if (c.type === 'workflow' && c.content) {
            return `Workflow:\n${c.content}`
          }
          if (c.type === 'current_workflow' && c.content) {
            return `Current workflow:\n${c.content}`
          }
          return c.content || ''
        })
        .filter(Boolean)
        .join('\n\n---\n\n')

      if (contextContent) {
        messages.push({
          role: 'system',
          content: `You are a helpful AI assistant. Use the following context to help the user:\n\n${contextContent}`,
        })
      }
    }

    // Add the user message
    messages.push({
      role: 'user',
      content: message,
    })

    // Prepare the provider request
    const providerRequest = {
      model: actualModel,
      messages,
      systemPrompt: '',
      stream,
      temperature: 0.7,
      maxTokens: 8192,
      apiKey: '', // Local providers don't need API key
      isCopilotRequest: true,
    }

    // Execute the provider request
    const result = await executeProviderRequest(providerId, providerRequest)

    // Handle streaming response
    if (stream && result && typeof result === 'object' && 'stream' in result) {
      const providerStream = result.stream as ReadableStream

      // Transform provider stream to SSE format expected by Copilot frontend
      const transformedStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          const reader = providerStream.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          const responseId = crypto.randomUUID()
          let sentDone = false

          // Send chatId event if provided
          if (chatId) {
            const chatIdEvent = `data: ${JSON.stringify({
              type: 'chat_id',
              chatId: chatId,
            })}\n\n`
            controller.enqueue(encoder.encode(chatIdEvent))
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              buffer += chunk

              // Check if this is SSE format (contains "data: ") or raw text
              if (buffer.includes('data: ')) {
                // Process SSE events from provider
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  if (line.trim() === '') continue

                  if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim()
                    if (data === '[DONE]') {
                      break
                    }

                    try {
                      const json = JSON.parse(data)
                      const content = json.choices?.[0]?.delta?.content || json.content || ''

                      if (content) {
                        const contentEvent = `data: ${JSON.stringify({
                          type: 'content',
                          data: content,
                        })}\n\n`
                        controller.enqueue(encoder.encode(contentEvent))
                      }
                    } catch (e) {
                      if (data) {
                        const contentEvent = `data: ${JSON.stringify({
                          type: 'content',
                          data: data,
                        })}\n\n`
                        controller.enqueue(encoder.encode(contentEvent))
                      }
                    }
                  }
                }
              } else {
                // Raw text stream from provider (like LM Studio)
                // Send the buffered content as a content event
                const content = buffer
                buffer = ''

                if (content) {
                  const contentEvent = `data: ${JSON.stringify({
                    type: 'content',
                    data: content,
                  })}\n\n`
                  controller.enqueue(encoder.encode(contentEvent))
                }
              }
            }

            // Send final done event
            if (!sentDone) {
              const finalDoneEvent = `data: ${JSON.stringify({
                type: 'done',
                data: { responseId },
              })}\n\n`
              controller.enqueue(encoder.encode(finalDoneEvent))
              sentDone = true
            }

            controller.close()
          } catch (error) {
            logger.error(`[${requestId}] Stream processing error`, {
              error: error instanceof Error ? error.message : String(error),
            })
            controller.error(error)
          }
        },
      })

      return new NextResponse(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Handle non-streaming response (shouldn't normally happen with Copilot)
    if (result && typeof result === 'object' && 'content' in result) {
      // Return SSE format for non-streaming as well
      const responseId = crypto.randomUUID()
      const content = result.content

      const sseContent = `data: ${JSON.stringify({
        type: 'content',
        data: content,
      })}\n\n`

      const sseDone = `data: ${JSON.stringify({
        type: 'done',
        data: { responseId },
      })}\n\n`

      return new NextResponse(sseContent + sseDone, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    logger.warn(`[${requestId}] Unexpected result format from provider`, {
      resultType: typeof result,
    })

    return NextResponse.json({ error: 'Unexpected response format' }, { status: 500 })
  } catch (error) {
    logger.error(`[${requestId}] Error in chat-completion-streaming`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
