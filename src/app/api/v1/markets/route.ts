import { NextResponse } from 'next/server'
import { getAllMarkets } from '@/services/market.service'
import type { ApiResponse } from '@/types'

export async function GET() {
  try {
    const data = await getAllMarkets()
    const response: ApiResponse<typeof data> = {
      data,
      meta: { total: data.length, updatedAt: new Date().toISOString() },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/markets]', error)
    return NextResponse.json(
      { data: [], meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
