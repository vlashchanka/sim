import type OpenAI from 'openai'

export function createReadableStreamFromLMStudioStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  onUpdate: (content: string, usage: any) => void
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      let accumulatedContent = ''
      let usage: any = {}

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || ''
          accumulatedContent += delta

          if (chunk.usage) {
            usage = chunk.usage
          }

          onUpdate(accumulatedContent, usage)

          controller.enqueue(new TextEncoder().encode(delta))
        }

        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
