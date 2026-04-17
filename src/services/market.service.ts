import { prisma } from '@/lib/db'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/redis'
import type { Market, MarketProductPrice } from '@/types'

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

export async function getMarketPricesForProduct(productCode: string): Promise<MarketProductPrice[]> {
  const cacheKey = `market-product:${productCode}`
  const cached = await getCache<MarketProductPrice[]>(cacheKey)
  if (cached) return cached

  // Find the latest date this product was traded at any market
  const latestRecord = await prisma.auctionPrice.findFirst({
    where: { product: { code: productCode } },
    orderBy: { auctionDate: 'desc' },
    select: { auctionDate: true },
  })
  if (!latestRecord) return []

  const rows = await prisma.auctionPrice.findMany({
    where: {
      product: { code: productCode },
      auctionDate: latestRecord.auctionDate,
    },
    include: { market: true },
  })

  // Group by market, aggregate
  const marketMap = new Map<string, {
    market: { code: string; name: string; region: string; address: string | null }
    prices: number[]
    minPrices: number[]
    maxPrices: number[]
    volumes: number[]
  }>()

  for (const row of rows) {
    const key = row.market.code
    if (!marketMap.has(key)) {
      marketMap.set(key, { market: row.market, prices: [], minPrices: [], maxPrices: [], volumes: [] })
    }
    const entry = marketMap.get(key)!
    entry.prices.push(Number(row.avgPrice))
    entry.minPrices.push(Number(row.minPrice))
    entry.maxPrices.push(Number(row.maxPrice))
    entry.volumes.push(Number(row.volume))
  }

  const result: MarketProductPrice[] = []
  for (const { market, prices, minPrices, maxPrices, volumes } of marketMap.values()) {
    result.push({
      marketCode: market.code,
      marketName: market.name,
      region: market.region,
      avgPrice: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
      minPrice: Math.min(...minPrices),
      maxPrice: Math.max(...maxPrices),
      volume: volumes.reduce((s, v) => s + v, 0),
      priceDate: latestRecord.auctionDate.toISOString().split('T')[0],
    })
  }

  result.sort((a, b) => b.avgPrice - a.avgPrice)
  await setCache(cacheKey, result, CACHE_TTL.PRICE_LIST)
  return result
}
