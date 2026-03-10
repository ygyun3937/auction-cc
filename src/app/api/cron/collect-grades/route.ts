import { NextRequest, NextResponse } from 'next/server'
import { collectGradeData } from '@/collectors/grade.collector'
import { z } from 'zod'

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    const targetDate = parsed.success ? parsed.data.date : undefined

    const result = await collectGradeData(targetDate)
    return NextResponse.json({ success: result.success, recordCount: result.recordCount, durationMs: result.durationMs })
  } catch (error) {
    console.error('[/api/cron/collect-grades]', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
