import { auth } from '@/../auth'
import { prisma } from '@/lib/db'
import { getNationwidePrices } from '@/services/price.service'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import FavoritesHeader from './FavoritesHeader'

export const dynamic = 'force-dynamic'

export default async function FavoritesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/api/auth/signin')

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  const productCodes = favorites.map((f: typeof favorites[number]) => f.productCode)

  const allPrices = productCodes.length > 0 ? await getNationwidePrices() : []
  const priceMap = new Map(allPrices.map(p => [p.productCode, p]))

  return (
    <div className="max-w-4xl mx-auto">
      <FavoritesHeader />

      {productCodes.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">☆</p>
          <p className="text-lg">즐겨찾기한 품목이 없습니다.</p>
          <Link href="/products" className="mt-4 inline-block text-green-600 hover:underline">
            품목 목록 보기
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productCodes.map(code => {
            const price = priceMap.get(code)
            return (
              <Link
                key={code}
                href={`/products/${code}`}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{price?.categoryName ?? '—'}</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                      {price?.productName ?? code}
                    </p>
                  </div>
                  {price?.change1d != null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      price.change1d > 0 ? 'bg-red-50 text-red-500' :
                      price.change1d < 0 ? 'bg-blue-50 text-blue-500' :
                      'bg-gray-50 text-gray-400'
                    }`}>
                      {price.change1d > 0 ? '▲' : price.change1d < 0 ? '▼' : ''}
                      {Math.abs(price.change1d).toFixed(1)}%
                    </span>
                  )}
                </div>
                {price ? (
                  <p className="mt-3 text-lg font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(price.todayAvg).toLocaleString()}
                    <span className="text-sm font-normal text-gray-500 ml-1">원/{price.unit}</span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-400">가격 정보 없음</p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
