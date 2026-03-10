import { searchProducts } from '@/services/product.service'
import { getAllMarkets } from '@/services/market.service'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  let products: Awaited<ReturnType<typeof searchProducts>> = []
  let markets: Awaited<ReturnType<typeof getAllMarkets>> = []

  if (query) {
    try {
      const [p, allMarkets] = await Promise.all([
        searchProducts(query),
        getAllMarkets(),
      ])
      products = p
      markets = allMarkets.filter(m => m.name.includes(query) || m.region.includes(query))
    } catch {
      // DB not ready
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {query ? `"${query}" 검색 결과` : '검색'}
        </h1>
        {query && (
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            품목 {products.length}개, 시장 {markets.length}개
          </p>
        )}
      </div>

      {!query && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>상단 검색창에서 품목명 또는 시장명을 검색하세요</p>
        </div>
      )}

      {query && products.length === 0 && markets.length === 0 && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>&quot;{query}&quot;에 대한 검색 결과가 없습니다</p>
        </div>
      )}

      {products.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">품목 ({products.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {products.map(p => (
              <Link
                key={p.code}
                href={`/products/${p.code}`}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-3 hover:border-green-400 hover:shadow-sm transition-all"
              >
                <p className="font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.category.name} · {p.unit}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {markets.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">시장 ({markets.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {markets.map(m => (
              <Link
                key={m.code}
                href={`/markets/${m.code}`}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-3 hover:border-green-400 hover:shadow-sm transition-all"
              >
                <p className="font-medium text-gray-900 dark:text-gray-100">{m.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.region}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
