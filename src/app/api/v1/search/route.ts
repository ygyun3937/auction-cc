import { NextRequest, NextResponse } from 'next/server'
import { searchProducts } from '@/services/product.service'
import { getAllMarkets } from '@/services/market.service'
import { z } from 'zod'
import type { ApiResponse, SearchResult } from '@/types'

const querySchema = z.object({
  q: z.string().min(1).max(50),
})

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({ q: req.nextUrl.searchParams.get('q') })
    const query = parsed.success ? parsed.data.q.trim() : null
    if (!query) {
      return NextResponse.json(
        { data: { products: [], markets: [] }, meta: {}, error: { code: 'MISSING_PARAM', message: '검색어를 입력해주세요.' } },
        { status: 400 }
      )
    }

    const [products, allMarkets] = await Promise.all([
      searchProducts(query.trim()),
      getAllMarkets(),
    ])

    const markets = allMarkets.filter(m =>
      m.name.includes(query) || m.region.includes(query)
    )

    const data: SearchResult = { products, markets }
    const response: ApiResponse<SearchResult> = {
      data,
      meta: { total: products.length + markets.length },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/search]', error)
    return NextResponse.json(
      { data: { products: [], markets: [] }, meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
