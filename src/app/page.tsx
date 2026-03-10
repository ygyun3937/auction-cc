import { getDashboardSummary, getNationwidePrices } from '@/services/price.service'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import type { NationwideProductPrice } from '@/types'

export const revalidate = 600 // 10분 ISR

export default async function HomePage() {
  let summary = null
  let nationwide: NationwideProductPrice[] = []

  try {
    ;[summary, nationwide] = await Promise.all([getDashboardSummary(), getNationwidePrices()])
  } catch {
    // DB not ready yet
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">전국 농수산물 도매가 현황</h1>
        <p className="text-gray-400 text-xs mt-0.5">전국 공영도매시장 실시간 경매 데이터 기반</p>
      </div>
      <DashboardClient summary={summary} nationwide={nationwide} />
    </div>
  )
}
