import type { AuctionPrice } from '@/types'

interface Props {
  auctions: AuctionPrice[]
}

export function MarketOverview({ auctions }: Props) {
  // Group by market
  const marketMap = new Map<string, { name: string; count: number; totalVolume: number }>()
  for (const a of auctions) {
    const key = a.market.code
    const existing = marketMap.get(key)
    if (existing) {
      existing.count++
      existing.totalVolume += a.volume
    } else {
      marketMap.set(key, { name: a.market.name, count: 1, totalVolume: a.volume })
    }
  }
  const markets = Array.from(marketMap.entries())
    .map(([code, data]) => ({ code, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">🏪 시장별 경매 현황</h2>
        <p className="text-xs text-gray-500 mt-0.5">오늘 경매 건수 기준</p>
      </div>
      <div className="p-4">
        {markets.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-8">오늘 경매 데이터 없음</div>
        ) : (
          <div className="space-y-3">
            {markets.map(market => {
              const maxCount = markets[0]?.count || 1
              const pct = Math.round((market.count / maxCount) * 100)
              return (
                <div key={market.code}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{market.name}</span>
                    <span className="text-gray-500">{market.count}건</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
