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
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">지역별 시장</h2>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {regions.map(([region, mList]) => (
            <div key={region} className="flex items-start gap-3 px-4 py-3">
              <span className="text-xs font-bold text-green-700 dark:text-green-400 w-10 shrink-0 pt-1">{region}</span>
              <div className="flex flex-wrap gap-1.5">
                {mList.map(m => (
                  <Link
                    key={m.code}
                    href={`/markets/${m.code}`}
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 transition-colors"
                  >
                    {m.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
