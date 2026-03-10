import Link from 'next/link'
import type { AuctionPrice } from '@/types'

interface Props {
  auctions: AuctionPrice[]
}

export function RecentAuctions({ auctions }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">📋 최근 경매 결과</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2 text-left text-gray-600 font-medium">품목</th>
              <th className="px-4 py-2 text-left text-gray-600 font-medium">시장</th>
              <th className="px-4 py-2 text-left text-gray-600 font-medium">등급</th>
              <th className="px-4 py-2 text-right text-gray-600 font-medium">평균가</th>
              <th className="px-4 py-2 text-right text-gray-600 font-medium">최저가</th>
              <th className="px-4 py-2 text-right text-gray-600 font-medium">최고가</th>
              <th className="px-4 py-2 text-right text-gray-600 font-medium">물량</th>
              <th className="px-4 py-2 text-center text-gray-600 font-medium">일자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {auctions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  경매 데이터가 없습니다
                </td>
              </tr>
            ) : (
              auctions.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/products/${a.product.code}`}
                      className="text-green-700 hover:underline font-medium"
                    >
                      {a.product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    <Link href={`/markets/${a.market.code}`} className="hover:underline">
                      {a.market.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                      {a.grade}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                    {a.avgPrice.toLocaleString()}원
                  </td>
                  <td className="px-4 py-2.5 text-right text-blue-600">
                    {a.minPrice.toLocaleString()}원
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-600">
                    {a.maxPrice.toLocaleString()}원
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600">
                    {a.volume.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{a.auctionDate}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
