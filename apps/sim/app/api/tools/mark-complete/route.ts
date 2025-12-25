import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('LocalSimAgentToolsMarkComplete')

/**
 * POST /api/tools/mark-complete
 * Local implementation of Sim Agent API endpoint
 * Marks a tool execution as complete
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    logger.info('[Local Tools Mark-Complete] Request received', { body })

    // Return success response
    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    logger.error('[Local Tools Mark-Complete] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
