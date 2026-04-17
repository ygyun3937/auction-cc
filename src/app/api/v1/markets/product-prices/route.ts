import { NextRequest, NextResponse } from 'next/server'
import { getMarketPricesForProduct } from '@/services/market.service'
import type { ApiResponse } from '@/types'

export async function GET(req: NextRequest) {
  const productCode = req.nextUrl.searchParams.get('productCode')?.trim()
  if (!productCode) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'productCode required' } }, { status: 400 })
  }
  try {
    const data = await getMarketPricesForProduct(productCode)
    const response: ApiResponse<typeof data> = {
      data,
      meta: { total: data.length, updatedAt: new Date().toISOString() },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/markets/product-prices]', error)
    return NextResponse.json(
      { data: [], meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
