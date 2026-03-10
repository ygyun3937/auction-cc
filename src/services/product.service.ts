import { prisma } from '@/lib/db'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/redis'
import type { Product } from '@/types'

export async function getAllProducts(categoryCode?: string): Promise<Product[]> {
  const cacheKey = CACHE_KEYS.productList(categoryCode)
  const cached = await getCache<Product[]>(cacheKey)
  if (cached) return cached

  const products = await prisma.product.findMany({
    where: categoryCode
      ? { category: { code: categoryCode } }
      : undefined,
    include: { category: true },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  })

  const result: Product[] = products.map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    unitQty: p.unitQty,
    category: { id: p.category.id, code: p.category.code, name: p.category.name },
  }))

  await setCache(cacheKey, result, CACHE_TTL.PRODUCT_LIST)
  return result
}

export async function getProductByCode(code: string): Promise<Product | null> {
  const product = await prisma.product.findUnique({
    where: { code },
    include: { category: true },
  })
  if (!product) return null
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    unit: product.unit,
    unitQty: product.unitQty,
    category: { id: product.category.id, code: product.category.code, name: product.category.name },
  }
}

export async function searchProducts(query: string): Promise<Product[]> {
  const cacheKey = CACHE_KEYS.search(query)
  const cached = await getCache<Product[]>(cacheKey)
  if (cached) return cached

  const products = await prisma.product.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    include: { category: true },
    take: 20,
    orderBy: { name: 'asc' },
  })

  const result: Product[] = products.map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    unitQty: p.unitQty,
    category: { id: p.category.id, code: p.category.code, name: p.category.name },
  }))

  await setCache(cacheKey, result, CACHE_TTL.SEARCH)
  return result
}
