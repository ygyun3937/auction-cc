import { prisma } from '@/lib/db'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/redis'
import type { Market } from '@/types'

export async function getAllMarkets(): Promise<Market[]> {
  const cacheKey = CACHE_KEYS.marketList()
  const cached = await getCache<Market[]>(cacheKey)
  if (cached) return cached

  const markets = await prisma.market.findMany({
    orderBy: [{ region: 'asc' }, { name: 'asc' }],
  })

  const result: Market[] = markets.map(m => ({
    id: m.id,
    code: m.code,
    name: m.name,
    region: m.region,
    address: m.address,
  }))

  await setCache(cacheKey, result, CACHE_TTL.MARKET_LIST)
  return result
}

export async function getMarketByCode(code: string): Promise<Market | null> {
  const market = await prisma.market.findUnique({ where: { code } })
  if (!market) return null
  return { id: market.id, code: market.code, name: market.name, region: market.region, address: market.address }
}
