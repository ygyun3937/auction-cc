import Link from 'next/link'
import type { PriceSummary } from '@/types'

interface Props {
  items: PriceSummary[]
}

export function TopMovers({ items }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">📈 가격 변동 상위</h2>
        <p className="text-xs text-gray-500 mt-0.5">전일 대비 변동률</p>
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">데이터 없음</div>
        ) : (
          items.map(item => (
            <Link
              key={item.productCode}
              href={`/products/${item.productCode}`}
              className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                <p className="text-xs text-gray-500">{item.priceDate}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {item.latestPrice.toLocaleString()}원
                </p>
                {item.changeRate !== null && (
                  <p
                    className={`text-xs font-medium ${
                      item.changeRate > 0
                        ? 'text-red-500'
                        : item.changeRate < 0
                        ? 'text-blue-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {item.changeRate > 0 ? '+' : ''}
                    {item.changeRate.toFixed(1)}%
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
