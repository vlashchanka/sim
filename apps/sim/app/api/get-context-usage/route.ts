import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('LocalSimAgentContextUsage')

/**
 * POST /api/get-context-usage
 * Local implementation of Sim Agent API endpoint
 * Returns context usage stats for Copilot
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { chatId, model, workflowId } = body

    logger.info('[Local Context Usage] Request received', {
      chatId,
      model,
      workflowId,
    })

    // Return mock context usage data
    // This endpoint is used by Copilot to track token usage
    // For local use, we return empty usage since billing is handled locally
    return NextResponse.json({
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      contextUsage: {
        contexts: [],
        totalTokens: 0,
      },
    })
  } catch (error) {
    logger.error('[Local Context Usage] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
