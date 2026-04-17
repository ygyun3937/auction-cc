import { getNationwidePrices } from '@/services/price.service'
import { ProductsTreemap } from '@/components/products/products-treemap'
import { ProductsTable } from '@/components/products/products-table'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  let nationwide: Awaited<ReturnType<typeof getNationwidePrices>> = []
  try {
    nationwide = await getNationwidePrices()
  } catch {
    // DB not ready
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">품목별 가격</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          전국 공영도매시장 품목별 경매 가격 정보
        </p>
      </div>

      {nationwide.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>품목 데이터가 없습니다. 첫 데이터 수집 후 표시됩니다.</p>
        </div>
      ) : (
        <>
          <ProductsTreemap data={nationwide} />
          <div className="mt-6">
            <ProductsTable data={nationwide} />
          </div>
        </>
      )}
    </div>
  )
}
