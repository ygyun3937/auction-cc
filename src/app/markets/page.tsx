import { getAllMarkets } from '@/services/market.service'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MarketsPage() {
  let markets: Awaited<ReturnType<typeof getAllMarkets>> = []
  try {
    markets = await getAllMarkets()
  } catch {
    // DB not ready
  }

  // Group by region
  const regionMap = new Map<string, typeof markets>()
  for (const m of markets) {
    if (!regionMap.has(m.region)) regionMap.set(m.region, [])
    regionMap.get(m.region)!.push(m)
  }
  const regions = Array.from(regionMap.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">시장별 현황</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">전국 공영도매시장 경매 현황</p>
      </div>

      {regions.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>시장 데이터가 없습니다. 첫 데이터 수집 후 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {regions.map(([region, mList]) => (
            <div key={region} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
                <h2 className="font-semibold text-green-800 dark:text-green-300">{region}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0 divide-x divide-y divide-gray-50 dark:divide-gray-700">
                {mList.map(m => (
                  <Link
                    key={m.code}
                    href={`/markets/${m.code}`}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <p className="font-medium text-gray-900 dark:text-gray-100">{m.name}</p>
                    {m.address && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{m.address}</p>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
