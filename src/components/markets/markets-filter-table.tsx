'use client'

import type { MarketProductPrice } from '@/types'

interface Props {
  productName: string
  markets: MarketProductPrice[]
  selectedCode: string | null
  onSelect: (code: string) => void
}

export function MarketsFilterTable({ productName, markets, selectedCode, onSelect }: Props) {
  if (markets.length === 0) return null

  return (
    <div className="mt-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {productName} 거래 시장
        </span>
        <span className="text-xs font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
          {markets.length}개
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">시장</th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">현재가</th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">등락</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {markets.map(m => {
            const isSelected = m.marketCode === selectedCode
            const spread = m.maxPrice - m.minPrice
            const spreadPct = m.avgPrice > 0 ? (spread / m.avgPrice) * 100 : 0

            return (
              <tr
                key={m.marketCode}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => onSelect(m.marketCode)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m.marketCode) } }}
                className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 ${
                  isSelected
                    ? 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}
              >
                <td className="px-4 py-2.5">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.marketName}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">{m.region}</div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {m.avgPrice.toLocaleString()}원
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {m.minPrice.toLocaleString()}~{m.maxPrice.toLocaleString()}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className={`text-xs font-semibold ${spreadPct > 5 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    ±{spreadPct.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {m.volume.toLocaleString()}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
