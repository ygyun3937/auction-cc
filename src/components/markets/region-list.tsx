import Link from 'next/link'
import type { Market } from '@/types'

interface Props {
  markets: Market[]
}

export function RegionList({ markets }: Props) {
  const regionMap = new Map<string, Market[]>()
  for (const m of markets) {
    if (!regionMap.has(m.region)) regionMap.set(m.region, [])
    regionMap.get(m.region)!.push(m)
  }
  const regions = Array.from(regionMap.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))

  if (regions.length === 0) return null

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">지역별 시장</h2>
      <div className="space-y-4">
        {regions.map(([region, mList]) => (
          <div key={region} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
              <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm">{region}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-x divide-y divide-gray-50 dark:divide-gray-700">
              {mList.map(m => (
                <Link
                  key={m.code}
                  href={`/markets/${m.code}`}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{m.name}</p>
                  {m.address && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{m.address}</p>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
