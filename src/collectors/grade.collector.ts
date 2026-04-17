import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import ky from 'ky'

const GRADE_LOCK_KEY = 'lock:grade-collection'
const LOCK_TTL = 600 // 10 minutes
const MIN_VOLUME = 5  // lower threshold since grade data is finer-grained

// katOrigin API (경매원천정보) - has grd_cd/grd_nm fields
const ORIGIN_API_BASE = 'https://apis.data.go.kr/B552845/katOrigin'

interface KatOriginItem {
  trd_clcln_ymd: string   // 거래정산일자
  whsl_mrkt_cd: string    // 도매시장코드
  whsl_mrkt_nm: string    // 도매시장명
  gds_lclsf_cd: string    // 대분류코드
  gds_lclsf_nm: string    // 대분류명
  gds_mclsf_cd: string    // 중분류코드
  gds_mclsf_nm: string    // 중분류명
  gds_sclsf_cd: string    // 소분류코드
  gds_sclsf_nm: string    // 소분류명
  grd_cd: string          // 등급코드
  grd_nm: string          // 등급명
  plor_nm?: string        // 산지명 (출하지)
  qty: string             // 물량
  scsbd_prc: string       // 낙찰가격
  unit_nm: string         // 단위
  unit_qty: string        // 단위중량
}

interface KatOriginResponse {
  response: {
    header: { resultCode: string; resultMsg: string }
    body: {
      items: { item: KatOriginItem[] } | null
      totalCount: number
      pageNo: number
      numOfRows: number
    }
  }
}

export async function collectGradeData(targetDate?: string): Promise<{
  success: boolean
  recordCount: number
  errorMsg?: string
  durationMs: number
}> {
  const startTime = Date.now()
  const saleDate = targetDate ?? new Date().toISOString().split('T')[0]

  const lockAcquired = await redis.set(GRADE_LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX')
  if (!lockAcquired) {
    return { success: false, recordCount: 0, errorMsg: 'Grade collection already in progress', durationMs: Date.now() - startTime }
  }

  let recordCount = 0
  try {
    console.log(`[grade-collector] Starting for ${saleDate}`)

    const allItems = await fetchAllGradeData(saleDate)
    if (allItems.length === 0) {
      console.log(`[grade-collector] No grade data for ${saleDate}`)
      return { success: true, recordCount: 0, durationMs: Date.now() - startTime }
    }

    console.log(`[grade-collector] Fetched ${allItems.length} grade items`)
    recordCount = await upsertGradeDailyPrices(allItems, saleDate)

    const originCount = await upsertOriginDailyPrices(allItems, saleDate)
    console.log(`[grade-collector] Origin records: ${originCount}`)

    // Invalidate grade cache
    const { deleteCache } = await import('@/lib/redis')
    await deleteCache('grade:*')

    console.log(`[grade-collector] Done: ${recordCount} grade records in ${Date.now() - startTime}ms`)
    return { success: true, recordCount, durationMs: Date.now() - startTime }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[grade-collector] Error:`, error)
    return { success: false, recordCount, errorMsg, durationMs: Date.now() - startTime }
  } finally {
    await redis.del(GRADE_LOCK_KEY)
  }
}

async function fetchAllGradeData(saleDate: string): Promise<KatOriginItem[]> {
  const apiKey = process.env.ORIGIN_API_KEY ?? process.env.PUBLIC_DATA_API_KEY
  if (!apiKey) {
    console.warn('[grade-collector] No API key configured')
    return []
  }

  const allItems: KatOriginItem[] = []
  let pageNo = 1
  const numOfRows = 1000

  while (true) {
    try {
      const url = new URL(`${ORIGIN_API_BASE}/trades`)
      url.searchParams.set('serviceKey', apiKey)
      url.searchParams.set('cond[trd_clcln_ymd::EQ]', saleDate)
      url.searchParams.set('pageNo', String(pageNo))
      url.searchParams.set('numOfRows', String(numOfRows))
      url.searchParams.set('returnType', 'json')

      const response = await ky.get(url.toString(), { timeout: 30000 }).json<KatOriginResponse>()
      if (response?.response?.header?.resultCode !== '0') break

      const items = response?.response?.body?.items?.item
      if (!Array.isArray(items) || items.length === 0) break
      allItems.push(...items)
      if (items.length < numOfRows) break
      pageNo++
    } catch {
      break
    }
  }

  return allItems
}

async function upsertGradeDailyPrices(items: KatOriginItem[], saleDate: string): Promise<number> {
  type Agg = { prices: number[]; totalQty: number; gradeName: string }
  const map = new Map<string, Agg>() // key: `${productCode}::${gradeCode}`

  for (const item of items) {
    const rawPrice = parseFloat(item.scsbd_prc)
    const unitQty = parseFloat(item.unit_qty) || 1
    const qty = parseFloat(item.qty) || 1
    if (isNaN(rawPrice) || rawPrice <= 0) continue

    const price = rawPrice / unitQty
    const catCode = item.gds_lclsf_cd || '00'
    const productCode = `${catCode}-${item.gds_mclsf_cd}`
    const gradeCode = item.grd_cd || '00'
    const gradeName = item.grd_nm || '기타'

    if (!item.gds_mclsf_cd || !item.gds_mclsf_nm || item.gds_mclsf_nm === '-') continue

    const key = `${productCode}::${gradeCode}`
    const existing = map.get(key)
    if (existing) {
      existing.prices.push(price)
      existing.totalQty += qty
    } else {
      map.set(key, { prices: [price], totalQty: qty, gradeName })
    }
  }

  const priceDate = new Date(saleDate)
  let count = 0

  for (const [key, agg] of map.entries()) {
    if (agg.totalQty < MIN_VOLUME) continue
    const [productCode, gradeCode] = key.split('::')
    const product = await prisma.product.findUnique({ where: { code: productCode } })
    if (!product) continue

    const filtered = removeOutliers(agg.prices)
    const avgPrice = filtered.reduce((s, p) => s + p, 0) / filtered.length
    const minPrice = Math.min(...filtered)
    const maxPrice = Math.max(...filtered)

    await prisma.gradeDailyPrice.upsert({
      where: { uq_grade_daily_price: { productId: product.id, priceDate, gradeCode } },
      update: { avgPrice, minPrice, maxPrice, totalVolume: agg.totalQty, gradeName: agg.gradeName },
      create: { productId: product.id, priceDate, gradeCode, gradeName: agg.gradeName, avgPrice, minPrice, maxPrice, totalVolume: agg.totalQty },
    })
    count++
  }
  return count
}

async function upsertOriginDailyPrices(items: KatOriginItem[], saleDate: string): Promise<number> {
  type Agg = { prices: number[]; totalQty: number }
  const map = new Map<string, Agg>() // key: `${productCode}::${originName}`

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
  let count = 0
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
    count++
  }
  return count
}

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
