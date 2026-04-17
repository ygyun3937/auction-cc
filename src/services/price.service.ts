import { prisma } from '@/lib/db'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/redis'
import type { AuctionPrice, DailyPrice, PriceTrend, PriceSummary, PriceQueryParams, PriceTrendParams, DashboardSummary, NationwideProductPrice, VarietyPrice, GradePrice, OriginPrice } from '@/types'

export async function getPrices(params: PriceQueryParams): Promise<{ data: AuctionPrice[]; total: number }> {
  const { marketCode, productCode, startDate, endDate, grade, page = 1, limit = 50 } = params

  const cacheKey = CACHE_KEYS.priceList(
    marketCode ?? 'all',
    productCode ?? 'all',
    `${startDate ?? ''}-${endDate ?? ''}-${grade ?? ''}-p${page}-l${limit}`
  )
  const cached = await getCache<{ data: AuctionPrice[]; total: number }>(cacheKey)
  if (cached) return cached

  const where = {
    ...(marketCode ? { market: { code: marketCode } } : {}),
    ...(productCode ? { product: { code: productCode } } : {}),
    ...(grade ? { grade } : {}),
    ...(startDate || endDate
      ? {
          auctionDate: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.auctionPrice.findMany({
      where,
      include: { market: true, product: { include: { category: true } } },
      orderBy: { auctionDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auctionPrice.count({ where }),
  ])

  const result = {
    data: data.map(p => ({
      id: p.id,
      marketId: p.marketId,
      productId: p.productId,
      auctionDate: p.auctionDate.toISOString().split('T')[0],
      grade: p.grade,
      avgPrice: Number(p.avgPrice),
      minPrice: Number(p.minPrice),
      maxPrice: Number(p.maxPrice),
      volume: Number(p.volume),
      unit: p.unit,
      market: { id: p.market.id, code: p.market.code, name: p.market.name, region: p.market.region },
      product: {
        id: p.product.id, code: p.product.code, name: p.product.name, unit: p.product.unit, unitQty: p.product.unitQty,
        category: { id: p.product.category.id, code: p.product.category.code, name: p.product.category.name },
      },
    })),
    total,
  }
  await setCache(cacheKey, result, CACHE_TTL.PRICE_LIST)
  return result
}

export async function getNationwidePrices(): Promise<NationwideProductPrice[]> {
  const cacheKey = CACHE_KEYS.nationwide()
  const cached = await getCache<NationwideProductPrice[]>(cacheKey)
  if (cached) return cached

  const latestRecord = await prisma.dailyPrice.findFirst({
    orderBy: { priceDate: 'desc' },
    select: { priceDate: true },
  })
  if (!latestRecord) return []

  const latestDate = latestRecord.priceDate
  const sevenDaysAgo = new Date(latestDate)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const dailyPrices = await prisma.dailyPrice.findMany({
    where: { priceDate: { gte: sevenDaysAgo, lte: latestDate } },
    include: { product: { include: { category: true } } },
    orderBy: { priceDate: 'desc' },
  })

  type Entry = {
    latest: (typeof dailyPrices)[0] | null
    history: (typeof dailyPrices)[0][]
    product: (typeof dailyPrices)[0]['product']
  }
  const productMap = new Map<string, Entry>()

  for (const dp of dailyPrices) {
    const code = dp.product.code
    if (!productMap.has(code)) {
      productMap.set(code, { latest: null, history: [], product: dp.product })
    }
    const entry = productMap.get(code)!
    if (dp.priceDate.getTime() === latestDate.getTime()) {
      entry.latest = dp
    } else {
      entry.history.push(dp)
    }
  }

  const result: NationwideProductPrice[] = []
  for (const entry of productMap.values()) {
    if (!entry.latest) continue
    const avg7d =
      entry.history.length > 0
        ? entry.history.reduce((s, d) => s + Number(d.avgPrice), 0) / entry.history.length
        : null
    const change7d =
      avg7d && avg7d > 0
        ? ((Number(entry.latest.avgPrice) - avg7d) / avg7d) * 100
        : null

    // history is sorted desc by priceDate; [0] is the most recent previous day
    const prevDay = entry.history[0] ?? null
    const change1d = entry.latest.changeRate
      ? Number(entry.latest.changeRate)
      : prevDay && Number(prevDay.avgPrice) > 0
        ? ((Number(entry.latest.avgPrice) - Number(prevDay.avgPrice)) / Number(prevDay.avgPrice)) * 100
        : null

    result.push({
      productCode: entry.product.code,
      productName: entry.product.name,
      categoryCode: entry.product.category.code,
      categoryName: entry.product.category.name,
      unit: entry.product.unit,
      unitQty: entry.product.unitQty,
      todayAvg: Number(entry.latest.avgPrice),
      todayMin: Number(entry.latest.minPrice),
      todayMax: Number(entry.latest.maxPrice),
      totalVolume: Number(entry.latest.totalVolume),
      change1d,
      change7d,
      priceDate: entry.latest.priceDate.toISOString().split('T')[0],
      excludedMarkets: entry.latest.excludedMarkets ?? 0,
    })
  }

  result.sort(
    (a, b) =>
      a.categoryCode.localeCompare(b.categoryCode) || a.productName.localeCompare(b.productName)
  )

  await setCache(cacheKey, result, CACHE_TTL.PRICE_LIST)
  return result
}

export async function getPriceTrend(params: PriceTrendParams): Promise<PriceTrend[]> {
  const { productCode, days = 30 } = params
  const cacheKey = CACHE_KEYS.priceTrend(productCode, days)
  const cached = await getCache<PriceTrend[]>(cacheKey)
  if (cached) return cached

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const data = await prisma.dailyPrice.findMany({
    where: {
      product: { code: productCode },
      priceDate: { gte: startDate, lte: endDate },
    },
    orderBy: { priceDate: 'asc' },
  })

  const result: PriceTrend[] = data.map(d => ({
    date: d.priceDate.toISOString().split('T')[0],
    avgPrice: Number(d.avgPrice),
    minPrice: Number(d.minPrice),
    maxPrice: Number(d.maxPrice),
    volume: Number(d.totalVolume),
  }))

  await setCache(cacheKey, result, CACHE_TTL.PRICE_TREND)
  return result
}

export async function getGradePrices(productCode: string): Promise<GradePrice[]> {
  const cacheKey = `grade:${productCode}`
  const cached = await getCache<GradePrice[]>(cacheKey)
  if (cached) return cached

  const latestRecord = await prisma.gradeDailyPrice.findFirst({
    where: { product: { code: productCode } },
    orderBy: { priceDate: 'desc' },
    select: { priceDate: true },
  })
  if (!latestRecord) return []

  const rows = await prisma.gradeDailyPrice.findMany({
    where: { product: { code: productCode }, priceDate: latestRecord.priceDate },
    orderBy: { gradeCode: 'asc' },
  })

  const result: GradePrice[] = rows.map(r => ({
    gradeCode: r.gradeCode,
    gradeName: r.gradeName,
    avgPrice: Number(r.avgPrice),
    minPrice: Number(r.minPrice),
    maxPrice: Number(r.maxPrice),
    totalVolume: Number(r.totalVolume),
    priceDate: r.priceDate.toISOString().split('T')[0],
  }))

  await setCache(cacheKey, result, CACHE_TTL.PRICE_LIST)
  return result
}

export async function getVarietyPrices(productCode: string): Promise<VarietyPrice[]> {
  const cacheKey = `variety:${productCode}`
  const cached = await getCache<VarietyPrice[]>(cacheKey)
  if (cached) return cached

  const latestRecord = await prisma.varietyDailyPrice.findFirst({
    where: { product: { code: productCode } },
    orderBy: { priceDate: 'desc' },
    select: { priceDate: true },
  })
  if (!latestRecord) return []

  const rows = await prisma.varietyDailyPrice.findMany({
    where: { product: { code: productCode }, priceDate: latestRecord.priceDate },
    orderBy: { totalVolume: 'desc' },
  })

  const result: VarietyPrice[] = rows.map(r => ({
    varietyCode: r.varietyCode,
    varietyName: r.varietyName,
    avgPrice: Number(r.avgPrice),
    minPrice: Number(r.minPrice),
    maxPrice: Number(r.maxPrice),
    totalVolume: Number(r.totalVolume),
    priceDate: r.priceDate.toISOString().split('T')[0],
  }))

  await setCache(cacheKey, result, CACHE_TTL.PRICE_LIST)
  return result
}

export async function getOriginPrices(productCode: string): Promise<OriginPrice[]> {
  const cacheKey = `origin:${productCode}`
  const cached = await getCache<OriginPrice[]>(cacheKey)
  if (cached) return cached

  const latestRecord = await prisma.originDailyPrice.findFirst({
    where: { product: { code: productCode } },
    orderBy: { priceDate: 'desc' },
    select: { priceDate: true },
  })
  if (!latestRecord) return []

  const rows = await prisma.originDailyPrice.findMany({
    where: { product: { code: productCode }, priceDate: latestRecord.priceDate },
    orderBy: { totalVolume: 'desc' },
    take: 20,
  })

  const result: OriginPrice[] = rows.map(r => ({
    originName: r.originName,
    avgPrice: Number(r.avgPrice),
    minPrice: Number(r.minPrice),
    maxPrice: Number(r.maxPrice),
    totalVolume: Number(r.totalVolume),
    priceDate: r.priceDate.toISOString().split('T')[0],
  }))

  await setCache(cacheKey, result, CACHE_TTL.PRICE_LIST)
  return result
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const cacheKey = CACHE_KEYS.summary()
  const cached = await getCache<DashboardSummary>(cacheKey)
  if (cached) return cached

  const [totalMarkets, totalProducts, latestLog, topMovers, recentAuctions] = await Promise.all([
    prisma.market.count(),
    prisma.product.count(),
    prisma.collectionLog.findFirst({ orderBy: { collectedAt: 'desc' }, where: { status: 'success' } }),
    prisma.dailyPrice.findMany({
      where: { changeRate: { not: null }, priceDate: { gte: new Date(Date.now() - 86400000) } },
      include: { product: true },
      orderBy: { changeRate: 'desc' },
      take: 10,
    }),
    prisma.auctionPrice.findMany({
      include: { market: true, product: { include: { category: true } } },
      orderBy: { auctionDate: 'desc' },
      take: 20,
    }),
  ])

  const result: DashboardSummary = {
    totalMarkets,
    totalProducts,
    latestUpdate: latestLog?.collectedAt.toISOString() ?? new Date().toISOString(),
    topMovers: topMovers.map(d => ({
      productCode: d.product.code,
      productName: d.product.name,
      unit: d.product.unit,
      latestPrice: Number(d.avgPrice),
      changeRate: d.changeRate ? Number(d.changeRate) : null,
      priceDate: d.priceDate.toISOString().split('T')[0],
    })),
    recentAuctions: recentAuctions.map(p => ({
      id: p.id,
      marketId: p.marketId,
      productId: p.productId,
      auctionDate: p.auctionDate.toISOString().split('T')[0],
      grade: p.grade,
      avgPrice: Number(p.avgPrice),
      minPrice: Number(p.minPrice),
      maxPrice: Number(p.maxPrice),
      volume: Number(p.volume),
      unit: p.unit,
      market: { id: p.market.id, code: p.market.code, name: p.market.name, region: p.market.region },
      product: {
        id: p.product.id, code: p.product.code, name: p.product.name, unit: p.product.unit, unitQty: p.product.unitQty,
        category: { id: p.product.category.id, code: p.product.category.code, name: p.product.category.name },
      },
    })),
  }

  await setCache(cacheKey, result, CACHE_TTL.SUMMARY)
  return result
}
