import { NextRequest, NextResponse } from 'next/server'
import { collectAuctionData } from '@/collectors/auction.collector'
import { z } from 'zod'

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(req: NextRequest) {
  // Fail-closed: require CRON_SECRET always
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/collect] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    const targetDate = parsed.success ? parsed.data.date : undefined

    const result = await collectAuctionData(targetDate)
    return NextResponse.json({ success: result.success, recordCount: result.recordCount, durationMs: result.durationMs })
  } catch (error) {
    console.error('[/api/cron/collect]', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
