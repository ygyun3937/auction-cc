import { NextRequest, NextResponse } from 'next/server'
import { getAllProducts } from '@/services/product.service'
import type { ApiResponse } from '@/types'

export async function GET(req: NextRequest) {
  try {
    const categoryCode = req.nextUrl.searchParams.get('categoryCode') ?? undefined
    const data = await getAllProducts(categoryCode)
    const response: ApiResponse<typeof data> = {
      data,
      meta: { total: data.length, updatedAt: new Date().toISOString() },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/products]', error)
    return NextResponse.json(
      { data: [], meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
