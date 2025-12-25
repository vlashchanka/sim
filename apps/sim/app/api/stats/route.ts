import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('LocalSimAgentStats')

/**
 * GET /api/stats
 * Local implementation of Sim Agent API stats endpoint
 * Returns Copilot usage statistics
 */
export async function GET(req: NextRequest) {
  try {
    logger.info('[Local Stats] Request received')

    // Return mock stats data
    return NextResponse.json({
      stats: {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
      },
    })
  } catch (error) {
    logger.error('[Local Stats] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
