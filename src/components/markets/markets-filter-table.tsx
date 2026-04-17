'use client'

import Link from 'next/link'
import type { MarketProductPrice } from '@/types'

interface Props {
  productName: string
  unit: string
  markets: MarketProductPrice[]
  selectedCode: string | null
  onSelect: (code: string) => void
}

export function MarketsFilterTable({ productName, unit, markets, selectedCode, onSelect }: Props) {
  if (markets.length === 0) return null

  const maxPrice = Math.max(...markets.map(m => m.avgPrice), 1)

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {productName} 거래 시장
        </span>
        <span className="text-xs font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
          {markets.length}개 시장
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">시장명 클릭 → 상세 보기</span>
      </div>

      {/* Table */}
      <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
        {markets.map(m => {
          const isSelected = m.marketCode === selectedCode
          const barPct = Math.round((m.avgPrice / maxPrice) * 100)

          return (
            <div
              key={m.marketCode}
              onClick={() => onSelect(m.marketCode)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
              }`}
            >
              {/* Market name + link */}
              <div className="w-28 shrink-0">
                <Link
                  href={`/markets/${m.marketCode}`}
                  onClick={e => e.stopPropagation()}
                  className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-green-600 dark:hover:text-green-400 transition-colors block truncate"
                >
                  {m.marketName}
                </Link>
                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">{m.region}</div>
              </div>

              {/* Price bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {m.avgPrice.toLocaleString()}원
                    <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-0.5">/{unit}</span>
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {m.minPrice.toLocaleString()} ~ {m.maxPrice.toLocaleString()}원
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isSelected ? 'bg-amber-400' : 'bg-green-500'}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>

              {/* Volume */}
              <div className="text-right shrink-0 w-16">
                <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {m.volume.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">박스</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
