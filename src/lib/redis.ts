import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Cache TTL constants (seconds)
export const CACHE_TTL = {
  PRICE_LIST: 600,        // 10분
  PRICE_TREND: 3600,      // 1시간
  PRODUCT_LIST: 86400,    // 24시간
  MARKET_LIST: 86400,     // 24시간
  SEARCH: 300,            // 5분
  SUMMARY: 600,           // 10분
} as const

// Redis key patterns
export const CACHE_KEYS = {
  priceList: (marketCode: string, productCode: string, date: string) =>
    `prices:${marketCode}:${productCode}:${date}`,
  priceTrend: (productCode: string, days: number) =>
    `trend:${productCode}:${days}d`,
  productList: (categoryCode?: string) =>
    `products:${categoryCode || 'all'}`,
  marketList: () => `markets:all`,
  search: (query: string) => `search:${encodeURIComponent(query)}`,
  summary: () => `summary:dashboard`,
  nationwide: () => `nationwide:prices`,
  collectionLock: () => `lock:collection`,
} as const

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key)
    return data ? (JSON.parse(data) as T) : null
  } catch {
    return null
  }
}

export async function setCache(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl)
  } catch {
    // Cache failures should not break the app
  }
}

export async function deleteCache(pattern: string): Promise<void> {
  try {
    // Use SCAN instead of KEYS to avoid blocking in production
    const keys: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor
      keys.push(...batch)
    } while (cursor !== '0')
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch {
    // ignore
  }
}
