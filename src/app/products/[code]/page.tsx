import { getProductByCode } from '@/services/product.service'
import { getPriceTrend, getPrices, getVarietyPrices, getGradePrices } from '@/services/price.service'
import { PriceTrendChart } from '@/components/charts/price-trend-chart'
import { FavoriteButton } from '@/components/products/favorite-button'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const revalidate = 600 // 10분 ISR

interface Props {
  params: Promise<{ code: string }>
  searchParams: Promise<{ days?: string }>
}

function ChangeBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  const isUp = value > 0
  const isDown = value < 0
  const color = isUp
    ? 'bg-red-50 text-red-500 border-red-100'
    : isDown
      ? 'bg-blue-50 text-blue-500 border-blue-100'
      : 'bg-gray-50 text-gray-400 border-gray-100'
  const arrow = isUp ? '▲' : isDown ? '▼' : ''
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${color}`}>
      {arrow} {Math.abs(value).toFixed(1)}% <span className="font-normal opacity-70">{label}</span>
    </span>
  )
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const { code } = await params
  const { days: daysStr } = await searchParams
  const days = Number(daysStr ?? 30)

  let product = null
  let trend: Awaited<ReturnType<typeof getPriceTrend>> = []
  let recentPrices: Awaited<ReturnType<typeof getPrices>>['data'] = []
  let varietyPrices: Awaited<ReturnType<typeof getVarietyPrices>> = []
  let gradePrices: Awaited<ReturnType<typeof getGradePrices>> = []

  try {
    product = await getProductByCode(code)
    if (!product) notFound()
    ;[trend, { data: recentPrices }, varietyPrices, gradePrices] = await Promise.all([
      getPriceTrend({ productCode: code, days }),
      getPrices({ productCode: code, limit: 50 }),
      getVarietyPrices(code),
      getGradePrices(code),
    ])
  } catch {
    if (!product) notFound()
  }

  const latestPrice = trend[trend.length - 1]

  // Compute change rates from trend data
  const change1d =
    trend.length >= 2
      ? ((trend[trend.length - 1].avgPrice - trend[trend.length - 2].avgPrice) /
          trend[trend.length - 2].avgPrice) *
        100
      : null

  const history7d = trend.slice(-8, -1)
  const avg7d =
    history7d.length > 0
      ? history7d.reduce((s, d) => s + d.avgPrice, 0) / history7d.length
      : null
  const change7d =
    avg7d && latestPrice ? ((latestPrice.avgPrice - avg7d) / avg7d) * 100 : null

  // Market comparison: latest date per market
  const latestDate = recentPrices[0]?.auctionDate
  const marketPrices = latestDate
    ? recentPrices
        .filter(p => p.auctionDate === latestDate)
        .sort((a, b) => b.avgPrice - a.avgPrice)
    : []
  const maxMarketPrice = Math.max(...marketPrices.map(p => p.avgPrice), 1)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-4">
        <Link href="/products" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">품목별 가격</Link>
        <span>›</span>
        <span>{product?.category.name}</span>
        <span>›</span>
        <span className="text-gray-700 dark:text-gray-300 font-medium">{product?.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{product?.name}</h1>
            {product && <FavoriteButton productCode={product.code} productName={product.name} />}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            가격: 원/{product?.unit}
            {product?.unitQty && product.unitQty > 1 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                1박스 = {product.unitQty}{product.unit}
              </span>
            )}
          </p>
          {latestPrice && (
            <div className="flex items-center gap-2 mt-2">
              <ChangeBadge value={change1d} label="전일" />
              <ChangeBadge value={change7d} label="7일평균" />
            </div>
          )}
        </div>
        {latestPrice && (
          <div className="text-right">
            <p className="text-3xl font-bold text-green-700 dark:text-green-400 tabular-nums">
              {Math.round(latestPrice.avgPrice).toLocaleString()}
              <span className="text-base font-normal text-gray-400 dark:text-gray-500 ml-0.5">원/{product?.unit}</span>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{latestPrice.date} 전국 평균</p>
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-1.5 mb-4">
        {[7, 14, 30, 90].map(d => (
          <Link
            key={d}
            href={`/products/${code}?days=${d}`}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              days === d
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-green-400'
            }`}
          >
            {d}일
          </Link>
        ))}
      </div>

      {/* Price trend chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">가격 추이</h2>
        <PriceTrendChart data={trend} productName={product?.name ?? ''} unitQty={product?.unitQty} unit={product?.unit} />
      </div>

      {/* Market comparison */}
      {marketPrices.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">시장별 가격 비교</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">{latestDate} 기준</span>
          </div>
          <div className="space-y-2.5">
            {marketPrices.map(p => {
              const pct = Math.round((p.avgPrice / maxMarketPrice) * 100)
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <Link
                    href={`/markets/${p.market.code}`}
                    className="w-24 text-xs text-gray-600 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-400 transition-colors truncate shrink-0"
                  >
                    {p.market.name}
                  </Link>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums w-20 text-right shrink-0">
                    {p.avgPrice.toLocaleString()}원
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Variety breakdown */}
      {varietyPrices.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm mb-4">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">품종별 가격</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">{varietyPrices[0]?.priceDate} 기준</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400 font-medium">품종</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium">평균가 (원/{product?.unit})</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">최저가</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">최고가</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium hidden md:table-cell">거래량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {varietyPrices.map(v => (
                  <tr key={v.varietyCode} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/70 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-gray-200">{v.varietyName}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {Math.round(v.avgPrice).toLocaleString()}원
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-blue-500 tabular-nums hidden sm:table-cell">
                      {Math.round(v.minPrice).toLocaleString()}원
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-red-400 tabular-nums hidden sm:table-cell">
                      {Math.round(v.maxPrice).toLocaleString()}원
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums hidden md:table-cell">
                      {v.totalVolume.toLocaleString()}박스
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grade breakdown */}
      {gradePrices.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm mb-4">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">등급별 가격</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">{gradePrices[0]?.priceDate} 기준</span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {gradePrices.map(g => (
              <div key={g.gradeCode} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{g.gradeName}</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {Math.round(g.avgPrice).toLocaleString()}
                  <span className="text-xs font-normal text-gray-400">원/{product?.unit}</span>
                </p>
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
                  <span className="text-blue-400">{Math.round(g.minPrice).toLocaleString()}</span>
                  <span>~</span>
                  <span className="text-red-400">{Math.round(g.maxPrice).toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{g.totalVolume.toLocaleString()}박스</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent auction prices table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">최근 경매 가격</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400 font-medium">일자</th>
                <th className="px-4 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400 font-medium">시장</th>
                <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium">평균가 (원/{product?.unit})</th>
                <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">최저가</th>
                <th className="px-4 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">최고가</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {recentPrices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                recentPrices.slice(0, 30).map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/70 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{p.auctionDate}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/markets/${p.market.code}`} className="text-xs text-green-700 dark:text-green-400 hover:underline">
                        {p.market.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {p.avgPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-blue-500 tabular-nums hidden sm:table-cell">
                      {p.minPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-red-400 tabular-nums hidden sm:table-cell">
                      {p.maxPrice.toLocaleString()}원
                    </td>
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
