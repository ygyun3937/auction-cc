import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { fetchAuctionData } from '@/lib/api-client'
import type { KatRealTimeItem } from '@/lib/api-client'
import { notifyFavoritesPrices } from '@/lib/discord'
import { sendPushNotification } from '@/lib/webpush'

const COLLECTION_LOCK_KEY = 'lock:collection'
const LOCK_TTL = 300 // 5 minutes
const MIN_VOLUME = 10 // minimum units traded per market to be included in daily aggregate

export async function collectAuctionData(targetDate?: string): Promise<{
  success: boolean
  recordCount: number
  errorMsg?: string
  durationMs: number
}> {
  const startTime = Date.now()
  const saleDate = targetDate ?? new Date().toISOString().split('T')[0]

  // Acquire distributed lock
  const lockAcquired = await redis.set(COLLECTION_LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX')
  if (!lockAcquired) {
    return { success: false, recordCount: 0, errorMsg: 'Collection already in progress', durationMs: Date.now() - startTime }
  }

  let recordCount = 0
  try {
    console.log(`[collector] Starting collection for ${saleDate}`)

    // Fetch all pages of data
    const allItems: KatRealTimeItem[] = []
    let pageNo = 1
    const numOfRows = 1000

    while (true) {
      const items = await fetchAuctionData({ saleDate, pageNo, numOfRows })
      if (items.length === 0) break
      allItems.push(...items)
      if (items.length < numOfRows) break
      pageNo++
    }

    if (allItems.length === 0) {
      console.log(`[collector] No data for ${saleDate}`)
      await logCollection({ status: 'success', recordCount: 0, source: 'public-data', durationMs: Date.now() - startTime })
      return { success: true, recordCount: 0, durationMs: Date.now() - startTime }
    }

    console.log(`[collector] Fetched ${allItems.length} raw items`)

    // Ensure market and product records exist
    await upsertMarketsAndProducts(allItems)

    // Aggregate and upsert auction prices
    recordCount = await upsertAggregatedPrices(allItems, saleDate)

    // Update daily aggregates
    await updateDailyAggregates(saleDate)

    // Update variety daily aggregates
    await updateVarietyDailyPrices(allItems, saleDate)

    // Update origin daily aggregates
    await updateOriginDailyPrices(allItems, saleDate)

    // Invalidate caches
    await invalidateCaches()

    // Send Discord notifications for favorited products
    await notifyFavoritesIfConfigured(saleDate)

    const durationMs = Date.now() - startTime
    await logCollection({ status: 'success', recordCount, source: 'public-data', durationMs })
    console.log(`[collector] Done: ${recordCount} records in ${durationMs}ms`)
    return { success: true, recordCount, durationMs }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startTime
    console.error(`[collector] Error:`, error)
    await logCollection({ status: 'error', recordCount, source: 'public-data', durationMs, errorMsg })
    return { success: false, recordCount, errorMsg, durationMs }
  } finally {
    await redis.del(COLLECTION_LOCK_KEY)
  }
}

async function upsertMarketsAndProducts(items: KatRealTimeItem[]) {
  // Upsert markets
  const marketMap = new Map<string, { code: string; name: string; region: string }>()
  for (const item of items) {
    if (!marketMap.has(item.whsl_mrkt_cd)) {
      marketMap.set(item.whsl_mrkt_cd, {
        code: item.whsl_mrkt_cd,
        name: item.whsl_mrkt_nm,
        region: getRegionFromMarketCode(item.whsl_mrkt_cd),
      })
    }
  }
  for (const market of marketMap.values()) {
    await prisma.market.upsert({
      where: { code: market.code },
      update: { name: market.name, region: market.region },
      create: market,
    })
  }

  // Upsert categories and products
  const categoryMap = new Map<string, { code: string; name: string }>()
  const productMap = new Map<string, { code: string; name: string; unit: string; unitQty: number; categoryCode: string }>()

  for (const item of items) {
    const catCode = item.gds_lclsf_cd || '00'
    const catName = getCategoryName(catCode)
    const rawProdCode = item.gds_mclsf_cd
    const prodCode = `${catCode}-${rawProdCode}` // globally unique composite key
    const prodName = item.gds_mclsf_nm
    const unit = item.unit_nm || 'kg'

    // Skip records with invalid/missing product or category names
    if (!rawProdCode || !prodName || prodName === '-' || prodName.trim() === '') continue

    if (!categoryMap.has(catCode)) {
      categoryMap.set(catCode, { code: catCode, name: catName })
    }
    if (!productMap.has(prodCode)) {
      const unitQty = Math.round(parseFloat(item.unit_qty) || 1)
      productMap.set(prodCode, { code: prodCode, name: prodName, unit, unitQty, categoryCode: catCode })
    }
  }

  for (const category of categoryMap.values()) {
    await prisma.productCategory.upsert({
      where: { code: category.code },
      update: { name: category.name },
      create: category,
    })
  }

  for (const product of productMap.values()) {
    const category = await prisma.productCategory.findUnique({ where: { code: product.categoryCode } })
    if (!category) continue
    await prisma.product.upsert({
      where: { code: product.code },
      update: { name: product.name, unit: product.unit, unitQty: product.unitQty },
      create: { code: product.code, name: product.name, unit: product.unit, unitQty: product.unitQty, categoryId: category.id },
    })
  }
}

async function upsertAggregatedPrices(items: KatRealTimeItem[], saleDate: string): Promise<number> {
  // Aggregate per market + product: compute avg/min/max from individual lots
  type Agg = { prices: number[]; totalQty: number; unit: string }
  const aggMap = new Map<string, Agg>()

  for (const item of items) {
    const rawPrice = parseFloat(item.scsbd_prc)
    const unitQty = parseFloat(item.unit_qty) || 1
    const qty = parseFloat(item.qty) || 1
    if (isNaN(rawPrice) || rawPrice <= 0) continue

    // scsbd_prc is price per lot (box/package); divide by unit_qty to get price per unit (kg/개)
    const price = rawPrice / unitQty

    const catCode = item.gds_lclsf_cd || '00'
    const key = `${item.whsl_mrkt_cd}::${catCode}-${item.gds_mclsf_cd}`
    const existing = aggMap.get(key)
    if (existing) {
      existing.prices.push(price)
      existing.totalQty += qty
    } else {
      aggMap.set(key, { prices: [price], totalQty: qty, unit: item.unit_nm || 'kg' })
    }
  }

  const auctionDateObj = new Date(saleDate)
  let count = 0

  for (const [key, agg] of aggMap.entries()) {
    const [marketCode, productCode] = key.split('::')
    const market = await prisma.market.findUnique({ where: { code: marketCode } })
    const product = await prisma.product.findUnique({ where: { code: productCode } })
    if (!market || !product) continue

    const filtered = removeOutliers(agg.prices)
    const outlierCount = agg.prices.length - filtered.length
    const avgPrice = filtered.reduce((s, p) => s + p, 0) / filtered.length
    const minPrice = Math.min(...filtered)
    const maxPrice = Math.max(...filtered)

    await prisma.auctionPrice.upsert({
      where: {
        uq_auction_price: {
          marketId: market.id,
          productId: product.id,
          auctionDate: auctionDateObj,
          grade: '평균',
        },
      },
      update: { avgPrice, minPrice, maxPrice, volume: agg.totalQty, unit: agg.unit, outlierCount },
      create: {
        marketId: market.id,
        productId: product.id,
        auctionDate: auctionDateObj,
        grade: '평균',
        avgPrice,
        minPrice,
        maxPrice,
        volume: agg.totalQty,
        unit: agg.unit,
        outlierCount,
      },
    })
    count++
  }
  return count
}

async function updateDailyAggregates(saleDate: string) {
  const auctionDate = new Date(saleDate)
  const products = await prisma.product.findMany()

  for (const product of products) {
    const prices = await prisma.auctionPrice.findMany({
      where: { productId: product.id, auctionDate },
    })
    if (prices.length === 0) continue

    // Step 1: Volume filter — exclude markets with too few units traded
    const volFiltered = prices.filter(p => Number(p.volume) >= MIN_VOLUME)
    const pricesForStats = volFiltered.length > 0 ? volFiltered : prices

    // Step 2: Cross-market IQR — filter out markets whose avgPrice is a statistical outlier
    const marketAvgs = pricesForStats.map(p => Number(p.avgPrice))
    const filteredAvgs = removeOutliers(marketAvgs)
    const excludedMarkets = prices.length - filteredAvgs.length
    const includedPrices = pricesForStats.filter(p => filteredAvgs.includes(Number(p.avgPrice)))

    const avgPrice = filteredAvgs.reduce((s, v) => s + v, 0) / filteredAvgs.length
    const minPrice = Math.min(...includedPrices.map(p => Number(p.minPrice)))
    const maxPrice = Math.max(...includedPrices.map(p => Number(p.maxPrice)))
    const totalVolume = prices.reduce((sum, p) => sum + Number(p.volume), 0)

    const prevDate = new Date(auctionDate)
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDaily = await prisma.dailyPrice.findUnique({
      where: { uq_daily_price: { productId: product.id, priceDate: prevDate } },
    })
    const changeRate = prevDaily
      ? ((avgPrice - Number(prevDaily.avgPrice)) / Number(prevDaily.avgPrice)) * 100
      : null

    await prisma.dailyPrice.upsert({
      where: { uq_daily_price: { productId: product.id, priceDate: auctionDate } },
      update: { avgPrice, minPrice, maxPrice, totalVolume, changeRate, excludedMarkets },
      create: { productId: product.id, priceDate: auctionDate, avgPrice, minPrice, maxPrice, totalVolume, changeRate, excludedMarkets },
    })
  }
}

async function updateVarietyDailyPrices(items: KatRealTimeItem[], saleDate: string) {
  type Agg = { prices: number[]; totalQty: number; varietyName: string }
  const map = new Map<string, Agg>() // key: `${productCode}::${varietyCode}`

  for (const item of items) {
    const rawPrice = parseFloat(item.scsbd_prc)
    const unitQty = parseFloat(item.unit_qty) || 1
    const qty = parseFloat(item.qty) || 1
    if (isNaN(rawPrice) || rawPrice <= 0) continue
    const price = rawPrice / unitQty

    const catCode = item.gds_lclsf_cd || '00'
    const productCode = `${catCode}-${item.gds_mclsf_cd}`
    const varietyCode = item.gds_sclsf_cd || '00'
    const varietyName = item.gds_sclsf_nm || '기타'
    if (!item.gds_mclsf_cd || !item.gds_mclsf_nm || item.gds_mclsf_nm === '-') continue

    const key = `${productCode}::${varietyCode}`
    const existing = map.get(key)
    if (existing) {
      existing.prices.push(price)
      existing.totalQty += qty
    } else {
      map.set(key, { prices: [price], totalQty: qty, varietyName })
    }
  }

  const priceDate = new Date(saleDate)
  for (const [key, agg] of map.entries()) {
    if (agg.totalQty < MIN_VOLUME) continue
    const [productCode, varietyCode] = key.split('::')
    const product = await prisma.product.findUnique({ where: { code: productCode } })
    if (!product) continue

    const filtered = removeOutliers(agg.prices)
    const avgPrice = filtered.reduce((s, p) => s + p, 0) / filtered.length
    const minPrice = Math.min(...filtered)
    const maxPrice = Math.max(...filtered)

    await prisma.varietyDailyPrice.upsert({
      where: { uq_variety_daily_price: { productId: product.id, priceDate, varietyCode } },
      update: { avgPrice, minPrice, maxPrice, totalVolume: agg.totalQty, varietyName: agg.varietyName },
      create: { productId: product.id, priceDate, varietyCode, varietyName: agg.varietyName, avgPrice, minPrice, maxPrice, totalVolume: agg.totalQty },
    })
  }
}

async function updateOriginDailyPrices(items: KatRealTimeItem[], saleDate: string) {
  type Agg = { prices: number[]; totalQty: number }
  const map = new Map<string, Agg>()

  for (const item of items) {
    const rawPrice = parseFloat(item.scsbd_prc)
    const unitQty = parseFloat(item.unit_qty) || 1
    const qty = parseFloat(item.qty) || 1
    if (isNaN(rawPrice) || rawPrice <= 0) continue
    if (!item.plor_nm || item.plor_nm === '-' || item.plor_nm === '') continue
    if (!item.gds_mclsf_cd || !item.gds_mclsf_nm || item.gds_mclsf_nm === '-') continue

    const price = rawPrice / unitQty
    const catCode = item.gds_lclsf_cd || '00'
    const productCode = `${catCode}-${item.gds_mclsf_cd}`
    const key = `${productCode}::${item.plor_nm}`
    const existing = map.get(key)
    if (existing) {
      existing.prices.push(price)
      existing.totalQty += qty
    } else {
      map.set(key, { prices: [price], totalQty: qty })
    }
  }

  const priceDate = new Date(saleDate)
  for (const [key, agg] of map.entries()) {
    if (agg.totalQty < MIN_VOLUME) continue
    const [productCode, originName] = key.split('::')
    const product = await prisma.product.findUnique({ where: { code: productCode } })
    if (!product) continue

    const filtered = removeOutliers(agg.prices)
    const avgPrice = filtered.reduce((s, p) => s + p, 0) / filtered.length
    const minPrice = Math.min(...filtered)
    const maxPrice = Math.max(...filtered)

    await prisma.originDailyPrice.upsert({
      where: { uq_origin_daily_price: { productId: product.id, priceDate, originName } },
      update: { avgPrice, minPrice, maxPrice, totalVolume: agg.totalQty },
      create: { productId: product.id, priceDate, originName, avgPrice, minPrice, maxPrice, totalVolume: agg.totalQty },
    })
  }
}

async function invalidateCaches() {
  const { deleteCache } = await import('@/lib/redis')
  await Promise.all([
    deleteCache('prices:*'),
    deleteCache('trend:*'),
    deleteCache('summary:*'),
  ])
}

async function logCollection(params: {
  status: string
  recordCount: number
  source: string
  durationMs: number
  errorMsg?: string
}) {
  await prisma.collectionLog.create({ data: params }).catch(() => {})
}

// IQR-based outlier removal: keep prices within Q1 - 1.5×IQR ~ Q3 + 1.5×IQR
function removeOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices
  const sorted = [...prices].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  if (iqr === 0) return prices
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  const result = sorted.filter(p => p >= lower && p <= upper)
  return result.length > 0 ? result : prices
}

function getCategoryName(code: string): string {
  const map: Record<string, string> = {
    '05': '서류', '06': '과실류', '08': '기타채소',
    '09': '과채류', '10': '엽채류', '11': '근채류', '12': '조미채소류',
    '13': '양채류', '14': '산나물류', '17': '버섯류',
    '21': '특채류', '22': '기타채소', '26': '화훼류',
    '28': '수산물', '29': '곡류', '43': '두류', '47': '서류',
    '52': '과채류', '61': '엽채류', '76': '근채류',
    '89': '산나물류', '91': '과실류', '93': '버섯류',
  }
  return map[code] ?? `기타`
}

function getRegionFromMarketCode(code: string): string {
  const prefix = code.substring(0, 2)
  const regionMap: Record<string, string> = {
    '11': '서울', '21': '부산', '22': '인천', '23': '대구',
    '24': '광주', '25': '대전', '26': '울산', '29': '세종',
    '31': '경기', '32': '강원', '33': '충북', '34': '충남',
    '35': '전북', '36': '전남', '37': '경북', '38': '경남', '39': '제주',
  }
  return regionMap[prefix] ?? '기타'
}

export async function notifyFavoritesForUser(userId: string, saleDate?: string): Promise<void> {
  // 1. 사용자 조회 (Discord webhook + push subscriptions 함께)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      discordWebhookUrl: true,
      pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
    },
  })

  // 2. 알림 채널 없으면 noop
  if (!user?.discordWebhookUrl && (!user?.pushSubscriptions || user.pushSubscriptions.length === 0)) return

  // 3. 날짜 결정
  let targetDate: string
  if (saleDate) {
    targetDate = saleDate
  } else {
    const latest = await prisma.dailyPrice.findFirst({
      orderBy: { priceDate: 'desc' },
      select: { priceDate: true },
    })
    if (!latest) return
    targetDate = latest.priceDate.toISOString().split('T')[0]
  }

  const priceDate = new Date(targetDate)

  // 4. 즐겨찾기 + dailyPrices 조회
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    select: { productCode: true },
  })
  if (favorites.length === 0) return

  const productCodes = favorites.map(f => f.productCode)

  const dailyPrices = await prisma.dailyPrice.findMany({
    where: {
      priceDate,
      product: { code: { in: productCodes } },
    },
    include: { product: true },
    orderBy: { product: { name: 'asc' } },
  })
  if (dailyPrices.length === 0) return

  const payload = dailyPrices.map(d => ({
    productCode: d.product.code,
    productName: d.product.name,
    unit: d.product.unit,
    unitQty: d.product.unitQty,
    avgPrice: Number(d.avgPrice),
    minPrice: Number(d.minPrice),
    maxPrice: Number(d.maxPrice),
    totalVolume: Number(d.totalVolume),
    changeRate: d.changeRate ? Number(d.changeRate) : null,
    priceDate: targetDate,
  }))

  // 5. 성공 추적
  let discordSuccess = false
  let pushSuccess = false

  // 6. Discord 발송 (webhook 있는 경우만)
  if (user.discordWebhookUrl) {
    try {
      await notifyFavoritesPrices(payload, user.discordWebhookUrl)
      discordSuccess = true
    } catch (err) {
      console.error(`[collector] Discord notification failed for user ${userId}:`, err)
    }
  }

  // 7. Web Push 발송 (구독 있는 경우)
  if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
    // Web Push 메시지 body 생성
    const first = payload[0]
    const priceStr = Math.round(first.avgPrice).toLocaleString('ko-KR')
    const pushBody = payload.length === 1
      ? `${first.productName} ${priceStr}원`
      : `${first.productName} ${priceStr}원 외 ${payload.length - 1}개 품목`

    const pushPayload = { title: '즐겨찾기 가격 알림', body: pushBody }

    for (const sub of user.pushSubscriptions) {
      try {
        await sendPushNotification(sub, pushPayload)
        pushSuccess = true
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          // 만료된 구독 — DB에서 삭제
          try {
            await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } })
          } catch (deleteErr) {
            console.error(`[collector] Failed to delete expired push subscription for user ${userId}:`, deleteErr)
          }
        } else {
          console.error(`[collector] Web Push failed for user ${userId} endpoint ${sub.endpoint}:`, err)
        }
      }
    }
  }

  // 8. 하나라도 성공한 경우 discordLastNotifiedAt 업데이트
  if (discordSuccess || pushSuccess) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { discordLastNotifiedAt: new Date() },
      })
    } catch (err) {
      console.error(`[collector] Failed to update discordLastNotifiedAt for user ${userId}:`, err)
    }
  }
}

export async function notifyFavoritesIfConfigured(saleDate?: string) {
  // Find the target date: use provided saleDate or fall back to latest dailyPrice date
  let targetDate: string
  if (saleDate) {
    targetDate = saleDate
  } else {
    const latest = await prisma.dailyPrice.findFirst({
      orderBy: { priceDate: 'desc' },
      select: { priceDate: true },
    })
    if (!latest) return
    targetDate = latest.priceDate.toISOString().split('T')[0]
  }

  // Only notify users WITHOUT a schedule (schedule users are handled by /api/cron/notify)
  const users = await prisma.user.findMany({
    where: {
      discordNotifyHour: null,
      OR: [
        { discordWebhookUrl: { not: null } },
        { pushSubscriptions: { some: {} } },
      ],
    },
    select: { id: true },
  })
  if (users.length === 0) return

  console.log(`[collector] Sending Discord notifications to ${users.length} users for ${targetDate}`)

  for (const user of users) {
    try {
      await notifyFavoritesForUser(user.id, targetDate)
      console.log(`[collector] Notified user ${user.id}`)
    } catch (error) {
      console.error(`[collector] Failed to notify user ${user.id}:`, error)
    }
  }
}
