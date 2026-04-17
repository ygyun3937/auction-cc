import { NextRequest, NextResponse } from 'next/server'
import { getOriginPrices } from '@/services/price.service'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productCode = searchParams.get('productCode')

  if (!productCode) {
    return NextResponse.json({ error: 'productCode required' }, { status: 400 })
  }

  const origins = await getOriginPrices(productCode)
  const date = origins.length > 0 ? origins[0].priceDate : null

  return NextResponse.json({ productCode, date, origins })
}
