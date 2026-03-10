'use client'

import type { DashboardSummary, NationwideProductPrice } from '@/types'
import { NationwidePrices } from './nationwide-prices'

interface Props {
  summary: DashboardSummary | null
  nationwide: NationwideProductPrice[]
}

export function DashboardClient({ summary, nationwide }: Props) {
  if (!summary && nationwide.length === 0) {
    return (
      <div className="text-center py-24 text-gray-500 dark:text-gray-400">
        <div className="text-5xl mb-4">🌾</div>
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">데이터를 준비 중입니다</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          서버 시작 후 첫 수집까지 약 1시간이 소요됩니다
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="전국 도매시장" value={summary?.totalMarkets ?? 0} unit="개" />
        <StatCard label="모니터링 품목" value={nationwide.length || (summary?.totalProducts ?? 0)} unit="개" />
        <StatCard label="오늘 수집 건수" value={summary?.recentAuctions.length ?? 0} unit="건" />
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 flex flex-col justify-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">최종 업데이트</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 truncate">
            {summary?.latestUpdate
              ? (() => {
                  const d = new Date(summary.latestUpdate)
                  const mm = String(d.getMonth() + 1).padStart(2, '0')
                  const dd = String(d.getDate()).padStart(2, '0')
                  const hh = String(d.getHours()).padStart(2, '0')
                  const min = String(d.getMinutes()).padStart(2, '0')
                  return `${mm}/${dd} ${hh}:${min}`
                })()
              : '-'}
          </p>
        </div>
      </div>

      {/* Nationwide price table */}
      <NationwidePrices items={nationwide} />
    </div>
  )
}

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 flex flex-col justify-center">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value.toLocaleString()}</span>
        <span className="text-sm text-gray-400 dark:text-gray-500 ml-1">{unit}</span>
      </p>
    </div>
  )
}
