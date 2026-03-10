import { NextRequest, NextResponse } from 'next/server'
import { getPriceTrend } from '@/services/price.service'
import { z } from 'zod'
import type { ApiResponse } from '@/types'

const querySchema = z.object({
  productCode: z.string().min(1).max(10),
  marketCode: z.string().regex(/^\d{6}$/).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) {
      return NextResponse.json(
        { data: [], meta: {}, error: { code: 'INVALID_PARAMS', message: parsed.error.message } },
        { status: 400 }
      )
    }

    const data = await getPriceTrend(parsed.data)

    const response: ApiResponse<typeof data> = {
      data,
      meta: { total: data.length, updatedAt: new Date().toISOString() },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/prices/trend]', error)
    return NextResponse.json(
      { data: [], meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
