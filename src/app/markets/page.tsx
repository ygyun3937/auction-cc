import { getAllMarkets } from '@/services/market.service'
import { getNationwidePrices } from '@/services/price.service'
import { MarketsMap } from '@/components/markets/markets-map'
import { RegionList } from '@/components/markets/region-list'

export const dynamic = 'force-dynamic'

export default async function MarketsPage() {
  let markets: Awaited<ReturnType<typeof getAllMarkets>> = []
  let nationwide: Awaited<ReturnType<typeof getNationwidePrices>> = []

  try {
    ;[markets, nationwide] = await Promise.all([getAllMarkets(), getNationwidePrices()])
  } catch {
    // DB not ready
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">시장별 현황</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">전국 공영도매시장 경매 현황</p>
      </div>

      {markets.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>시장 데이터가 없습니다. 첫 데이터 수집 후 표시됩니다.</p>
        </div>
      ) : (
        <>
          <MarketsMap markets={markets} nationwide={nationwide} />
          <RegionList markets={markets} />
        </>
      )}
    </div>
  )
}
