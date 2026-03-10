import { NextRequest, NextResponse } from 'next/server'
import { getPrices } from '@/services/price.service'
import { z } from 'zod'
import type { ApiResponse } from '@/types'

const querySchema = z.object({
  marketCode: z.string().regex(/^\d{6}$/).optional(),
  productCode: z.string().regex(/^\d{4}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  grade: z.enum(['특', '상', '중', '하']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
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
    const params = parsed.data

    const { data, total } = await getPrices(params)
    const response: ApiResponse<typeof data> = {
      data,
      meta: { total, page: params.page, limit: params.limit, updatedAt: new Date().toISOString() },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/prices]', error)
    return NextResponse.json(
      { data: [], meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
