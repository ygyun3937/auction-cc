'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import type { NationwideProductPrice } from '@/types'
import { isSeasonalProduct } from '@/lib/seasonal'

interface Props {
  items: NationwideProductPrice[]
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
  const isUp = value > 0
  const isDown = value < 0
  const color = isUp ? 'text-red-500' : isDown ? 'text-blue-500' : 'text-gray-400'
  const arrow = isUp ? '▲' : isDown ? '▼' : ''
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function PriceRangeBar({ min, avg, max }: { min: number; avg: number; max: number }) {
  const range = max - min
  const pct = range > 0 ? Math.round(((avg - min) / range) * 100) : 50
  return (
    <div className="flex items-center gap-1.5 min-w-[120px]">
      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{min.toLocaleString()}</span>
      <div className="relative flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
        <div
          className="absolute top-0 left-0 h-1.5 bg-green-200 rounded-full"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-green-600 rounded-full border border-white shadow-sm"
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{max.toLocaleString()}</span>
    </div>
  )
}

export function NationwidePrices({ items }: Props) {
  const { data: session } = useSession()
  const categoryNames = Array.from(new Set(items.map(i => i.categoryName)))
  const [activeTab, setActiveTab] = useState('TOP10')
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([])

  useEffect(() => {
    if (!session) return
    fetch('/api/favorites')
      .then(r => r.json())
      .then((codes: string[]) => setFavoriteCodes(codes))
      .catch(() => {})
  }, [session])

  const top10 = [...items].sort((a, b) => (b.totalVolume ?? 0) - (a.totalVolume ?? 0)).slice(0, 10)
  const favoriteItems = items.filter(i => favoriteCodes.includes(i.productCode))

  const filtered =
    activeTab === 'TOP10' ? top10 :
    activeTab === '즐겨찾기' ? favoriteItems :
    activeTab === '전체' ? items :
    items.filter(i => i.categoryName === activeTab)

  const risers = [...items]
    .filter(i => i.change7d !== null)
    .sort((a, b) => (b.change7d ?? 0) - (a.change7d ?? 0))
    .slice(0, 4)
  const fallers = [...items]
    .filter(i => i.change7d !== null)
    .sort((a, b) => (a.change7d ?? 0) - (b.change7d ?? 0))
    .slice(0, 4)

  return (
    <div className="space-y-4">
      {/* Top movers row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs font-semibold text-red-500 mb-2">급등 TOP (7일 대비)</p>
          <div className="space-y-1.5">
            {risers.map(item => (
              <Link
                key={item.productCode}
                href={`/products/${item.productCode}`}
                className="flex items-center justify-between hover:bg-red-50 dark:hover:bg-gray-700 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                  {item.productName}
                  {isSeasonalProduct(item.productName) && <span className="text-xs">🌿</span>}
                </span>
                <span className="text-xs font-semibold text-red-500">
                  ▲ {Math.abs(item.change7d ?? 0).toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs font-semibold text-blue-500 mb-2">급락 TOP (7일 대비)</p>
          <div className="space-y-1.5">
            {fallers.map(item => (
              <Link
                key={item.productCode}
                href={`/products/${item.productCode}`}
                className="flex items-center justify-between hover:bg-blue-50 dark:hover:bg-gray-700 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                  {item.productName}
                  {isSeasonalProduct(item.productName) && <span className="text-xs">🌿</span>}
                </span>
                <span className="text-xs font-semibold text-blue-500">
                  ▼ {Math.abs(item.change7d ?? 0).toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main price table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">전국 품목별 도매가</h2>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'TOP10', label: '🔥 거래량 TOP10' },
              ...(session ? [{ key: '즐겨찾기', label: `★ 즐겨찾기${favoriteCodes.length > 0 ? ` (${favoriteCodes.length})` : ''}` }] : []),
              { key: '전체', label: '전체' },
              ...categoryNames.map(c => ({ key: c, label: c })),
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="px-4 py-2 text-left text-xs text-gray-500 dark:text-gray-400 font-medium">품목</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400 font-medium">전국 평균가</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400 font-medium">7일 대비</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400 font-medium hidden md:table-cell">거래량</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 dark:text-gray-400 font-medium hidden lg:table-cell">
                  가격 범위 (최저 ~ 최고)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                    {activeTab === '즐겨찾기'
                      ? '즐겨찾기한 품목이 없습니다. 품목 상세 페이지에서 ★ 버튼을 눌러 추가하세요.'
                      : '데이터가 없습니다'}
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr key={item.productCode} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/70 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/products/${item.productCode}`} className="group">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors flex items-center gap-1">
                            {item.productName}
                            {isSeasonalProduct(item.productName) && (
                              <span className="text-xs" title={`${new Date().getMonth() + 1}월 제철`}>🌿</span>
                            )}
                          </p>
                          {item.excludedMarkets > 0 && (
                            <span
                              title={`이상치 시장 ${item.excludedMarkets}곳 제외됨`}
                              className="text-amber-400 text-xs cursor-help"
                            >
                              ⚠️
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{item.unit}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                        {item.todayAvg.toLocaleString()}원
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">
                        /{item.unitQty > 1 ? `${item.unitQty}${item.unit}` : item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangeBadge value={item.change7d} />
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="text-xs text-gray-700 dark:text-gray-300 tabular-nums">
                        {(item.totalVolume ?? 0).toLocaleString()}박스
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">
                        × {item.unitQty}{item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <PriceRangeBar min={item.todayMin} avg={item.todayAvg} max={item.todayMax} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-50 dark:border-gray-700 text-right">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              기준일: {filtered[0]?.priceDate ?? '-'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
