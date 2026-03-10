import { getMarketByCode } from '@/services/market.service'
import { getPrices } from '@/services/price.service'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const revalidate = 600

interface Props {
  params: Promise<{ code: string }>
}

export default async function MarketDetailPage({ params }: Props) {
  const { code } = await params

  let market = null
  let recentPrices: Awaited<ReturnType<typeof getPrices>>['data'] = []

  try {
    market = await getMarketByCode(code)
    if (!market) notFound()
    const result = await getPrices({ marketCode: code, limit: 50 })
    recentPrices = result.data
  } catch {
    if (!market) notFound()
  }

  // Group by product
  const productMap = new Map<string, { name: string; avgPrice: number; date: string; grade: string }>()
  for (const p of recentPrices) {
    if (!productMap.has(p.product.code)) {
      productMap.set(p.product.code, {
        name: p.product.name,
        avgPrice: p.avgPrice,
        date: p.auctionDate,
        grade: p.grade,
      })
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link href="/markets" className="hover:underline">시장별 현황</Link>
          <span>›</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{market?.name}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{market?.name}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{market?.region} {market?.address && `• ${market.address}`}</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">최근 경매 현황</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">품목별 최근 경락가격</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300 font-medium">품목</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300 font-medium">등급</th>
                <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300 font-medium">평균가</th>
                <th className="px-4 py-2 text-center text-gray-600 dark:text-gray-300 font-medium">일자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {productMap.size === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">경매 데이터가 없습니다</td></tr>
              ) : (
                Array.from(productMap.entries()).map(([productCode, data]) => (
                  <tr key={productCode} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${productCode}`} className="text-green-700 dark:text-green-400 hover:underline font-medium">
                        {data.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        {data.grade}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">{data.avgPrice.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-center text-gray-500 dark:text-gray-400">{data.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
