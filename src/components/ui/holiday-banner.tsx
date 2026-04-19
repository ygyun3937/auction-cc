export function HolidayBanner({ priceDate }: { priceDate?: string }) {
  const today = new Date().toISOString().split('T')[0]
  if (!priceDate || priceDate === today) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-700 dark:text-amber-400">
      <span>📅</span>
      <span>
        오늘({today}) 경매 휴장일 · <span className="font-semibold">{priceDate}</span> 마지막 거래 기준 데이터입니다
      </span>
    </div>
  )
}
