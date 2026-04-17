'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NationwideProductPrice } from '@/types'
import { isSeasonalProduct } from '@/lib/seasonal'

type SortKey = 'name' | 'price' | 'change'

function getPriceColorClass(change: number | null): string {
  if (change == null || Math.abs(change) < 0.5) return 'text-gray-400 dark:text-gray-500'
  return change > 0 ? 'text-red-500' : 'text-blue-500'
}

export function ProductsTable({ data }: { data: NationwideProductPrice[] }) {
  const router = useRouter()

  const categories = Array.from(
    new Map(data.map(p => [p.categoryCode, p.categoryName])).entries()
  )

  const [activeCategory, setActiveCategory] = useState(categories[0]?.[0] ?? '')
  const [sortKey, setSortKey] = useState<SortKey>('change')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = data.filter(p => p.categoryCode === activeCategory)
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (sortKey === 'name') diff = a.productName.localeCompare(b.productName, 'ko')
    else if (sortKey === 'price') diff = a.todayAvg - b.todayAvg
    else diff = (a.change1d ?? -Infinity) - (b.change1d ?? -Infinity)
    return sortDir === 'asc' ? diff : -diff
  })

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null
    return sortDir === 'desc' ? ' ↓' : ' ↑'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Category tabs */}
      <div className="overflow-x-auto border-b border-gray-100 dark:border-gray-700">
        <div className="flex min-w-max">
          {categories.map(([code, name]) => (
            <button
              key={code}
              onClick={() => setActiveCategory(code)}
              className={`px-3 sm:px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeCategory === code
                  ? 'text-green-600 dark:text-green-400 border-green-500'
                  : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <th className="px-3 sm:px-4 py-2.5 text-left">
              <button
                onClick={() => handleSort('name')}
                className="text-xs text-gray-400 dark:text-gray-500 font-semibold hover:text-gray-700 dark:hover:text-gray-300"
              >
                품목{sortIndicator('name')}
              </button>
            </th>
            <th className="px-3 sm:px-4 py-2.5 text-right">
              <button
                onClick={() => handleSort('price')}
                className="text-xs text-gray-400 dark:text-gray-500 font-semibold hover:text-gray-700 dark:hover:text-gray-300"
              >
                현재가{sortIndicator('price')}
              </button>
            </th>
            <th className="px-3 sm:px-4 py-2.5 text-right">
              <button
                onClick={() => handleSort('change')}
                className={`text-xs font-semibold hover:text-red-400 ${
                  sortKey === 'change' ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                등락{sortIndicator('change')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 sm:px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                데이터가 없습니다
              </td>
            </tr>
          ) : sorted.map(p => {
            const changeAmt =
              p.change1d != null ? Math.round((p.todayAvg * p.change1d) / 100) : null
            const colorClass = getPriceColorClass(p.change1d)

            return (
              <tr
                key={p.productCode}
                onClick={() => router.push(`/products/${p.productCode}`)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {p.productName}
                    </span>
                    {isSeasonalProduct(p.productName) && (
                      <span className="text-xs" title={`${new Date().getMonth() + 1}월 제철`}>🌿</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">원/{p.unit}</div>
                </td>
                <td className={`px-3 sm:px-4 py-2.5 sm:py-3 text-right text-sm sm:text-base font-bold tabular-nums ${colorClass}`}>
                  {Math.round(p.todayAvg).toLocaleString()}
                </td>
                <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
                  {p.change1d != null ? (
                    <>
                      <div className={`text-sm font-bold tabular-nums ${colorClass}`}>
                        {changeAmt != null
                          ? `${changeAmt > 0 ? '+' : ''}${changeAmt.toLocaleString()}`
                          : '—'}
                      </div>
                      <div className={`text-xs font-semibold ${colorClass}`}>
                        {p.change1d > 0 ? '+' : ''}
                        {p.change1d.toFixed(2)}%
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
