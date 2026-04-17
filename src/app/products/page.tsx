import { getAllProducts } from '@/services/product.service'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  let products: Awaited<ReturnType<typeof getAllProducts>> = []
  try {
    products = await getAllProducts()
  } catch {
    // DB not ready
  }

  // Group by category
  const categoryMap = new Map<string, { name: string; products: typeof products }>()
  for (const p of products) {
    const key = p.category.code
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { name: p.category.name, products: [] })
    }
    categoryMap.get(key)!.products.push(p)
  }
  const categories = Array.from(categoryMap.entries())

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">품목별 가격</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">전국 공영도매시장 품목별 경매 가격 정보</p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>품목 데이터가 없습니다. 첫 데이터 수집 후 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(([code, cat]) => (
            <div key={code} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
                <h2 className="font-semibold text-green-800 dark:text-green-300">{cat.name}</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 divide-x divide-y divide-gray-50 dark:divide-gray-700">
                {cat.products.map(p => (
                  <Link
                    key={p.code}
                    href={`/products/${p.code}`}
                    className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{p.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{p.unit}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
