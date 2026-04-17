# Markets Map + Seasonal Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/markets` text-list page with a Leaflet map of Korea (Option C — seasonal strip + all-products strip + per-market filter table), and add 🌿 seasonal badges to products across all pages.

**Architecture:** Static seasonal lookup (`src/lib/seasonal.ts`) drives badges everywhere. The Leaflet map is a `'use client'` component that uses `useEffect` for DOM init (same pattern as the D3 treemap). When user selects a product, the map component calls `/api/v1/markets/product-prices?productCode=XXX` to get per-market prices and renders a filter table below the map.

**Tech Stack:** Leaflet (vanilla, no react-leaflet), TypeScript, Next.js App Router, Prisma, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/seasonal.ts` | Create | Month → product name array lookup + `isSeasonalProduct()` |
| `src/lib/market-coords.ts` | Create | Market code → lat/lng lookup + region fallback |
| `src/types/index.ts` | Modify | Add `MarketProductPrice` interface |
| `src/services/market.service.ts` | Modify | Add `getMarketPricesForProduct()` |
| `src/app/api/v1/markets/product-prices/route.ts` | Create | GET handler → calls service |
| `src/components/markets/markets-map.tsx` | Create | Leaflet map, two filter strips, filter state |
| `src/components/markets/markets-filter-table.tsx` | Create | Per-market price table, row → map pan callback |
| `src/components/markets/region-list.tsx` | Create | Extracted region-grouped list (server component) |
| `src/app/markets/page.tsx` | Modify | Compose map + region list, fetch both data sources |
| `src/components/products/products-treemap.tsx` | Modify | Add 🌿 SVG text on seasonal leaf cells |
| `src/components/products/products-table.tsx` | Modify | Add 🌿 span in 품목 column |
| `src/components/dashboard/nationwide-prices.tsx` | Modify | Add 🌿 badge per row |
| `src/app/products/[code]/page.tsx` | Modify | Add seasonal banner below breadcrumb |

---

### Task 1: Seasonal lookup + market coords libs

**Files:**
- Create: `src/lib/seasonal.ts`
- Create: `src/lib/market-coords.ts`

- [ ] **Step 1: Create `src/lib/seasonal.ts`**

```typescript
// src/lib/seasonal.ts

export const SEASONAL_BY_MONTH: Record<number, string[]> = {
  1:  ['딸기', '한라봉', '귤', '시금치', '우엉'],
  2:  ['딸기', '한라봉', '귤', '봄동', '달래'],
  3:  ['딸기', '봄동', '냉이', '달래', '쑥', '주꾸미', '도다리'],
  4:  ['딸기', '봄배추', '냉이', '달래', '두릅', '쑥', '참나물', '대파', '주꾸미', '도다리'],
  5:  ['참외', '딸기', '봄배추', '두릅', '오이', '주꾸미'],
  6:  ['참외', '자두', '복숭아', '오이', '감자', '양파', '매실'],
  7:  ['복숭아', '자두', '수박', '오이', '옥수수', '토마토', '감자'],
  8:  ['복숭아', '수박', '포도', '옥수수', '토마토', '오이', '고추'],
  9:  ['포도', '사과', '배', '고구마', '버섯', '전어'],
  10: ['사과', '배', '단감', '고구마', '버섯', '무', '배추'],
  11: ['사과', '배', '단감', '무', '배추', '김장배추', '굴'],
  12: ['귤', '한라봉', '굴', '무', '배추', '시금치'],
}

export function isSeasonalProduct(productName: string, month?: number): boolean {
  const m = month ?? new Date().getMonth() + 1
  const names = SEASONAL_BY_MONTH[m] ?? []
  return names.some(n => productName.includes(n))
}

export function getSeasonalNames(month?: number): string[] {
  const m = month ?? new Date().getMonth() + 1
  return SEASONAL_BY_MONTH[m] ?? []
}
```

- [ ] **Step 2: Create `src/lib/market-coords.ts`**

```typescript
// src/lib/market-coords.ts

export const MARKET_COORDS: Record<string, { lat: number; lng: number }> = {
  '110001': { lat: 37.4932, lng: 127.1222 }, // 서울가락
  '110002': { lat: 37.5644, lng: 126.8348 }, // 서울강서
  '210001': { lat: 35.1491, lng: 128.9625 }, // 부산엄궁
  '210002': { lat: 35.1872, lng: 129.1261 }, // 부산반여
  '220001': { lat: 37.5060, lng: 126.7228 }, // 인천삼산
  '220002': { lat: 37.4497, lng: 126.7054 }, // 인천구월
  '230001': { lat: 35.9010, lng: 128.5869 }, // 대구북부
  '240001': { lat: 35.1696, lng: 126.9090 }, // 광주각화
  '250001': { lat: 36.3601, lng: 127.3553 }, // 대전오정
  '260001': { lat: 35.5582, lng: 129.3114 }, // 울산
  '310001': { lat: 37.2634, lng: 127.0284 }, // 수원
  '310002': { lat: 37.3942, lng: 126.9568 }, // 안양
  '310003': { lat: 37.5006, lng: 126.7763 }, // 부천
  '310004': { lat: 37.5957, lng: 127.1467 }, // 구리
  '310005': { lat: 37.3219, lng: 126.8309 }, // 안산
  '320001': { lat: 37.8725, lng: 127.7259 }, // 춘천
  '330001': { lat: 36.6372, lng: 127.4897 }, // 청주
  '340001': { lat: 36.8151, lng: 127.1138 }, // 천안
  '350001': { lat: 35.8243, lng: 127.1481 }, // 전주
  '360001': { lat: 34.8118, lng: 126.3922 }, // 목포
  '370001': { lat: 36.0191, lng: 129.3435 }, // 포항
  '380001': { lat: 35.2285, lng: 128.5820 }, // 창원마산
  '390001': { lat: 33.4890, lng: 126.4983 }, // 제주
}

const REGION_CENTERS: Record<string, { lat: number; lng: number }> = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '세종': { lat: 36.4800, lng: 127.2890 },
  '경기': { lat: 37.4138, lng: 127.5183 },
  '강원': { lat: 37.8228, lng: 128.1555 },
  '충북': { lat: 36.8000, lng: 127.7000 },
  '충남': { lat: 36.5184, lng: 126.8000 },
  '전북': { lat: 35.7175, lng: 127.1530 },
  '전남': { lat: 34.8679, lng: 126.9910 },
  '경북': { lat: 36.4919, lng: 128.8889 },
  '경남': { lat: 35.4606, lng: 128.2132 },
  '제주': { lat: 33.4996, lng: 126.5312 },
}

export function getMarketCoords(code: string, region: string): { lat: number; lng: number } | null {
  return MARKET_COORDS[code] ?? REGION_CENTERS[region] ?? null
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/seasonal.ts src/lib/market-coords.ts
git commit -m "feat: add seasonal lookup and market coordinates libs"
```

---

### Task 2: MarketProductPrice type + service + API route

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/market.service.ts`
- Create: `src/app/api/v1/markets/product-prices/route.ts`

- [ ] **Step 1: Add `MarketProductPrice` to `src/types/index.ts`**

Add after the `Market` interface (after line 23):

```typescript
export interface MarketProductPrice {
  marketCode: string
  marketName: string
  region: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  volume: number
  priceDate: string
}
```

- [ ] **Step 2: Add `getMarketPricesForProduct` to `src/services/market.service.ts`**

Add to the end of `src/services/market.service.ts`:

```typescript
import type { Market, MarketProductPrice } from '@/types'

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
    market: typeof rows[0]['market']
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
```

Note: `src/services/market.service.ts` already imports `prisma`, `getCache`, `setCache`, `CACHE_KEYS`, `CACHE_TTL` — check the imports at the top and add any missing ones. The existing file starts with:
```typescript
import { prisma } from '@/lib/db'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/redis'
import type { Market } from '@/types'
```
Change the last import line to:
```typescript
import type { Market, MarketProductPrice } from '@/types'
```

- [ ] **Step 3: Create API route `src/app/api/v1/markets/product-prices/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getMarketPricesForProduct } from '@/services/market.service'
import type { ApiResponse } from '@/types'

export async function GET(req: NextRequest) {
  const productCode = req.nextUrl.searchParams.get('productCode')
  if (!productCode) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'productCode required' } }, { status: 400 })
  }
  try {
    const data = await getMarketPricesForProduct(productCode)
    const response: ApiResponse<typeof data> = {
      data,
      meta: { total: data.length, updatedAt: new Date().toISOString() },
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[/api/v1/markets/product-prices]', error)
    return NextResponse.json(
      { data: [], meta: {}, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Test the API route manually**

Run the dev server and hit:
```
curl http://localhost:3000/api/v1/markets/product-prices?productCode=01
```
Expected: `{ data: [...], meta: { total: N } }` (or `{ data: [] }` if no data for code `01`)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/market.service.ts src/app/api/v1/markets/product-prices/route.ts
git commit -m "feat: add MarketProductPrice type, service function, and API route"
```

---

### Task 3: Install Leaflet + MarketsFilterTable component

**Files:**
- Create: `src/components/markets/markets-filter-table.tsx`

- [ ] **Step 1: Install leaflet**

```bash
npm install leaflet @types/leaflet
```

Expected: leaflet added to `package.json` dependencies, `@types/leaflet` to devDependencies.

- [ ] **Step 2: Create `src/components/markets/markets-filter-table.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import type { MarketProductPrice } from '@/types'

interface Props {
  productName: string
  markets: MarketProductPrice[]
  selectedCode: string | null
  onSelect: (code: string) => void
}

function cc(change: number | null) {
  if (change == null || Math.abs(change) < 0.5) return 'text-gray-400 dark:text-gray-500'
  return change > 0 ? 'text-red-500' : 'text-blue-500'
}

export function MarketsFilterTable({ productName, markets, selectedCode, onSelect }: Props) {
  const router = useRouter()

  if (markets.length === 0) return null

  return (
    <div className="mt-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {productName} 거래 시장
        </span>
        <span className="text-xs font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
          {markets.length}개
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">시장</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">현재가</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">등락</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {markets.map(m => {
            const isSelected = m.marketCode === selectedCode
            const spread = m.maxPrice - m.minPrice
            const spreadPct = m.avgPrice > 0 ? (spread / m.avgPrice) * 100 : 0

            return (
              <tr
                key={m.marketCode}
                onClick={() => {
                  onSelect(m.marketCode)
                }}
                className={`cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}
              >
                <td className="px-4 py-2.5">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.marketName}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">{m.region}</div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {m.avgPrice.toLocaleString()}원
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {m.minPrice.toLocaleString()}~{m.maxPrice.toLocaleString()}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className={`text-xs font-semibold ${spreadPct > 5 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    ±{spreadPct.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {m.volume.toLocaleString()}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/markets/markets-filter-table.tsx package.json package-lock.json
git commit -m "feat: add MarketsFilterTable component + install leaflet"
```

---

### Task 4: MarketsMap component (Leaflet)

**Files:**
- Create: `src/components/markets/markets-map.tsx`

Context: This component uses the same `useEffect` + `useRef` pattern as `src/components/products/products-treemap.tsx`. Leaflet accesses `document` at import time — wrap the entire `import L from 'leaflet'` inside the useEffect using a dynamic import pattern. Import the CSS at the module level (Next.js app router handles it fine for client components).

- [ ] **Step 1: Create `src/components/markets/markets-map.tsx`**

```tsx
'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Market, NationwideProductPrice, MarketProductPrice, ApiResponse } from '@/types'
import { isSeasonalProduct, getSeasonalNames } from '@/lib/seasonal'
import { getMarketCoords } from '@/lib/market-coords'
import { MarketsFilterTable } from './markets-filter-table'

type PinState = 'normal' | 'highlight' | 'selected' | 'dim'

interface MarkerEntry {
  marker: unknown // L.Marker — typed as unknown to avoid leaflet import at module level
  code: string
  region: string
  name: string
  lat: number
  lng: number
}

interface ActiveProduct {
  productCode: string
  productName: string
  isSeasonal: boolean
}

interface Props {
  markets: Market[]
  nationwide: NationwideProductPrice[]
}

function pinHtml(state: PinState): string {
  const styles: Record<PinState, string> = {
    normal:    'width:12px;height:12px;border-radius:50%;background:#16a34a;border:2px solid #4ade80;box-shadow:0 0 7px rgba(74,222,128,.5)',
    highlight: 'width:16px;height:16px;border-radius:50%;background:#f59e0b;border:2.5px solid #fde68a;box-shadow:0 0 12px rgba(251,191,36,.8)',
    selected:  'width:18px;height:18px;border-radius:50%;background:#e11d48;border:2.5px solid #fda4af;box-shadow:0 0 16px rgba(225,29,72,.8)',
    dim:       'width:8px;height:8px;border-radius:50%;background:#374151;border:1.5px solid #4b5563;opacity:.35',
  }
  return `<div style="${styles[state]}"></div>`
}

export function MarketsMap({ markets, nationwide }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<unknown>(null) // L.Map
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map())

  const [activeProduct, setActiveProduct] = useState<ActiveProduct | null>(null)
  const [selectedMarketCode, setSelectedMarketCode] = useState<string | null>(null)
  const [filterMarkets, setFilterMarkets] = useState<MarketProductPrice[]>([])
  const [loadingFilter, setLoadingFilter] = useState(false)

  const month = new Date().getMonth() + 1
  const seasonalNames = getSeasonalNames(month)

  // Seasonal products: NationwideProductPrice items whose name matches this month's seasonal list
  const seasonalProducts = nationwide.filter(p => isSeasonalProduct(p.productName, month))
  // All products sorted by volume desc, exclude duplicates already in seasonal
  const seasonalCodes = new Set(seasonalProducts.map(p => p.productCode))
  const otherProducts = nationwide.filter(p => !seasonalCodes.has(p.productCode))

  const setMarkerState = useCallback((code: string, state: PinState) => {
    const entry = markersRef.current.get(code)
    if (!entry) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (!L) return
    const icon = L.divIcon({
      className: '',
      html: pinHtml(state),
      iconSize: state === 'selected' ? [18, 18] : state === 'highlight' ? [16, 16] : state === 'dim' ? [8, 8] : [12, 12],
      iconAnchor: state === 'selected' ? [9, 9] : state === 'highlight' ? [8, 8] : state === 'dim' ? [4, 4] : [6, 6],
      popupAnchor: [0, state === 'selected' ? -10 : -8],
    })
    ;(entry.marker as ReturnType<typeof L.marker>).setIcon(icon)
    ;(entry.marker as ReturnType<typeof L.marker>).setZIndexOffset(
      state === 'selected' ? 2000 : state === 'highlight' ? 1000 : 0
    )
  }, [])

  const applyFilter = useCallback(async (prod: NationwideProductPrice, isSeasonal: boolean) => {
    setActiveProduct({ productCode: prod.productCode, productName: prod.productName, isSeasonal })
    setSelectedMarketCode(null)
    setLoadingFilter(true)

    try {
      const res = await fetch(`/api/v1/markets/product-prices?productCode=${prod.productCode}`)
      const json: ApiResponse<MarketProductPrice[]> = await res.json()
      const marketPrices = json.data ?? []
      setFilterMarkets(marketPrices)

      const activeCodes = new Set(marketPrices.map(m => m.marketCode))
      markersRef.current.forEach((_, code) => {
        setMarkerState(code, activeCodes.has(code) ? 'highlight' : 'dim')
      })
    } catch {
      setFilterMarkets([])
    } finally {
      setLoadingFilter(false)
    }
  }, [setMarkerState])

  const clearFilter = useCallback(() => {
    setActiveProduct(null)
    setSelectedMarketCode(null)
    setFilterMarkets([])
    markersRef.current.forEach((_, code) => setMarkerState(code, 'normal'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mapInstanceRef.current as any)?.closePopup()
  }, [setMarkerState])

  const selectMarket = useCallback((code: string) => {
    const entry = markersRef.current.get(code)
    if (!entry || !mapInstanceRef.current) return

    // Reset previous selected
    if (selectedMarketCode && selectedMarketCode !== code) {
      const activeCodes = new Set(filterMarkets.map(m => m.marketCode))
      setMarkerState(selectedMarketCode, activeCodes.has(selectedMarketCode) ? 'highlight' : 'normal')
    }

    setSelectedMarketCode(code)
    setMarkerState(code, 'selected')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapInstanceRef.current as any
    map.panTo([entry.lat, entry.lng], { animate: true, duration: 0.5 })
    ;(entry.marker as ReturnType<typeof import('leaflet').marker>).openPopup()
  }, [selectedMarketCode, filterMarkets, setMarkerState])

  useEffect(() => {
    if (!mapRef.current) return

    // Dynamic import to avoid SSR issues
    import('leaflet').then(({ default: L }) => {
      // Expose L globally for icon updates after init
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).L = L

      if (mapInstanceRef.current) return // already initialized

      const koreaBounds = L.latLngBounds([33.0, 124.5], [38.6, 130.5])
      const map = L.map(mapRef.current!, {
        center: [36.2, 127.8],
        zoom: 7,
        minZoom: 6,
        maxZoom: 12,
        maxBounds: koreaBounds,
        maxBoundsViscosity: 1.0,
        zoomControl: true,
        attributionControl: false,
      })
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        bounds: koreaBounds,
      }).addTo(map)

      markets.forEach(m => {
        const coords = getMarketCoords(m.code, m.region)
        if (!coords) return

        const icon = L.divIcon({
          className: '',
          html: pinHtml('normal'),
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          popupAnchor: [0, -8],
        })

        const marker = L.marker([coords.lat, coords.lng], { icon }).addTo(map)
        marker.bindPopup(`
          <div style="font-size:13px;font-weight:700;color:#f1f5f9">${m.name}</div>
          <div style="font-size:11px;color:#4ade80;margin-top:1px">${m.region}</div>
          ${m.address ? `<div style="font-size:10px;color:#64748b;margin-top:4px">${m.address}</div>` : ''}
        `)

        const entry: MarkerEntry = { marker, code: m.code, region: m.region, name: m.name, lat: coords.lat, lng: coords.lng }
        markersRef.current.set(m.code, entry)
      })
    })

    return () => {
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapInstanceRef.current as any).remove()
        mapInstanceRef.current = null
        markersRef.current.clear()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).L
      }
    }
  }, [markets])

  // Attach selectMarket to marker clicks (re-run when selectMarket changes)
  useEffect(() => {
    markersRef.current.forEach((entry) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(entry.marker as any).off('click').on('click', () => selectMarket(entry.code))
    })
  }, [selectMarket])

  function chipColor(change: number | null) {
    if (change == null || Math.abs(change) < 0.5) return 'text-gray-400'
    return change > 0 ? 'text-red-400' : 'text-blue-400'
  }
  function fmtChg(c: number | null) {
    if (c == null) return '—'
    return (c > 0 ? '▲' : c < 0 ? '▼' : '') + Math.abs(c).toFixed(1) + '%'
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm">
      {/* Filter status bar */}
      {activeProduct && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 text-sm">
          <span className="font-bold text-amber-600 dark:text-amber-400">
            {activeProduct.isSeasonal ? '🌿 ' : ''}{activeProduct.productName}
          </span>
          {activeProduct.isSeasonal && (
            <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5">
              제철
            </span>
          )}
          <span className="text-gray-500 dark:text-gray-400 text-xs">
            {loadingFilter ? '로딩 중...' : `${filterMarkets.length}개 시장 거래`}
          </span>
          <button
            onClick={clearFilter}
            className="ml-auto text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5"
          >
            ✕ 해제
          </button>
        </div>
      )}

      {/* Map */}
      <div className="relative">
        <div ref={mapRef} style={{ width: '100%', height: '420px' }} />

        {/* Overlay: seasonal + all products */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-auto"
          style={{ background: 'linear-gradient(to top, rgba(15,23,42,.97) 70%, transparent)', padding: '24px 12px 12px' }}>

          {/* Seasonal strip */}
          {seasonalProducts.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-bold text-green-400 tracking-wide mb-1.5">
                🌿 {month}월 제철
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {seasonalProducts.map(p => (
                  <button
                    key={p.productCode}
                    onClick={() => activeProduct?.productCode === p.productCode ? clearFilter() : applyFilter(p, true)}
                    className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-left transition-all border ${
                      activeProduct?.productCode === p.productCode
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-green-800 bg-green-900/40 hover:border-green-500'
                    }`}
                  >
                    <div className="text-xs font-bold text-green-100 whitespace-nowrap">{p.productName}</div>
                    <div className={`text-xs font-bold tabular-nums ${chipColor(p.change1d)}`}>
                      {Math.round(p.todayAvg).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-700/50 my-2" />

          {/* All products strip */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5">전체 품목</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {otherProducts.slice(0, 20).map(p => (
                <button
                  key={p.productCode}
                  onClick={() => activeProduct?.productCode === p.productCode ? clearFilter() : applyFilter(p, false)}
                  className={`flex-shrink-0 rounded-md px-2 py-1.5 text-left transition-all border ${
                    activeProduct?.productCode === p.productCode
                      ? 'border-amber-400 bg-amber-400/10'
                      : 'border-gray-700 bg-gray-800/70 hover:border-gray-500'
                  }`}
                  style={{ minWidth: '60px' }}
                >
                  <div className="text-xs font-bold text-gray-200 whitespace-nowrap">{p.productName}</div>
                  <div className={`text-xs font-bold tabular-nums ${chipColor(p.change1d)}`}>
                    {Math.round(p.todayAvg).toLocaleString()}
                  </div>
                  <div className={`text-xs ${chipColor(p.change1d)}`}>{fmtChg(p.change1d)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filter table (shown when product selected) */}
      {activeProduct && !loadingFilter && filterMarkets.length > 0 && (
        <MarketsFilterTable
          productName={activeProduct.productName}
          markets={filterMarkets}
          selectedCode={selectedMarketCode}
          onSelect={selectMarket}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /path/to/auction-monitor && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/components/markets/markets-map.tsx
git commit -m "feat: add MarketsMap Leaflet component with seasonal/product filter overlay"
```

---

### Task 5: RegionList component + markets page wiring

**Files:**
- Create: `src/components/markets/region-list.tsx`
- Modify: `src/app/markets/page.tsx`

- [ ] **Step 1: Create `src/components/markets/region-list.tsx`**

Extract the region list from the current `src/app/markets/page.tsx` into a server component:

```tsx
// src/components/markets/region-list.tsx
import Link from 'next/link'
import type { Market } from '@/types'

interface Props {
  markets: Market[]
}

export function RegionList({ markets }: Props) {
  const regionMap = new Map<string, Market[]>()
  for (const m of markets) {
    if (!regionMap.has(m.region)) regionMap.set(m.region, [])
    regionMap.get(m.region)!.push(m)
  }
  const regions = Array.from(regionMap.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))

  if (regions.length === 0) return null

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">지역별 시장</h2>
      <div className="space-y-4">
        {regions.map(([region, mList]) => (
          <div key={region} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
              <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm">{region}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-x divide-y divide-gray-50 dark:divide-gray-700">
              {mList.map(m => (
                <Link
                  key={m.code}
                  href={`/markets/${m.code}`}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{m.name}</p>
                  {m.address && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{m.address}</p>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/app/markets/page.tsx`**

```tsx
import { getAllMarkets } from '@/services/market.service'
import { getNationwidePrices } from '@/services/price.service'
import { MarketsMap } from '@/components/markets/markets-map'
import { RegionList } from '@/components/markets/region-list'

export const dynamic = 'force-dynamic'

export default async function MarketsPage() {
  let markets: Awaited<ReturnType<typeof getAllMarkets>> = []
  let nationwide: Awaited<ReturnType<typeof getNationwidePrices>> = []

  try {
    ;[markets, nationwide] = await Promise.all([getAllMarkets(), getNationwidePrices()])
  } catch {
    // DB not ready
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">시장별 현황</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">전국 공영도매시장 경매 현황</p>
      </div>

      {markets.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>시장 데이터가 없습니다. 첫 데이터 수집 후 표시됩니다.</p>
        </div>
      ) : (
        <>
          <MarketsMap markets={markets} nationwide={nationwide} />
          <RegionList markets={markets} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Start dev server and verify the page loads without errors**

```bash
npm run dev
```

Open `http://localhost:3000/markets`. Expected:
- Map renders with green pins for each market
- Product strips visible at bottom of map
- Region list below
- No console errors

- [ ] **Step 4: Commit**

```bash
git add src/components/markets/region-list.tsx src/app/markets/page.tsx
git commit -m "feat: wire up MarketsMap and RegionList on /markets page"
```

---

### Task 6: Seasonal badges — Products page (treemap + table)

**Files:**
- Modify: `src/components/products/products-treemap.tsx`
- Modify: `src/components/products/products-table.tsx`

- [ ] **Step 1: Add 🌿 badge to `products-treemap.tsx`**

In the `render()` function inside `useEffect`, in the `cell.each(function(d) {...})` block, after the existing text elements for name/price/change%, add a seasonal badge for cells that are wide enough.

Add this import at the top of the file:
```typescript
import { isSeasonalProduct } from '@/lib/seasonal'
```

In the `cell.each(function(d) {...})` block, after the last `if (h >= 64)` block and inside the `if (w >= 44 && h >= 38)` branch, add:

```typescript
if (isSeasonalProduct(item.productName)) {
  g.append('text')
    .attr('x', w - 4)
    .attr('y', 12)
    .attr('text-anchor', 'end')
    .attr('font-size', Math.min(11, w / 5))
    .attr('pointer-events', 'none')
    .text('🌿')
}
```

- [ ] **Step 2: Add 🌿 badge to `products-table.tsx`**

Add import at top:
```typescript
import { isSeasonalProduct } from '@/lib/seasonal'
```

In the `<td className="px-3 sm:px-4 ...">` for 품목 column, change:
```tsx
<div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
  {p.productName}
</div>
```
to:
```tsx
<div className="flex items-center gap-1">
  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
    {p.productName}
  </span>
  {isSeasonalProduct(p.productName) && (
    <span className="text-xs" title={`${new Date().getMonth() + 1}월 제철`}>🌿</span>
  )}
</div>
```

- [ ] **Step 3: Verify at `http://localhost:3000/products`**

In April, products matching `['딸기', '봄배추', '냉이', '달래', '두릅', '쑥', '참나물', '대파', '주꾸미', '도다리']` should show 🌿. The treemap cells should have a small 🌿 in the top-right corner if the cell is wide enough.

- [ ] **Step 4: Commit**

```bash
git add src/components/products/products-treemap.tsx src/components/products/products-table.tsx
git commit -m "feat: add seasonal 🌿 badges to products treemap and table"
```

---

### Task 7: Seasonal badges — Dashboard + Product detail

**Files:**
- Modify: `src/components/dashboard/nationwide-prices.tsx`
- Modify: `src/app/products/[code]/page.tsx`

- [ ] **Step 1: Add 🌿 to `nationwide-prices.tsx`**

Add import at top:
```typescript
import { isSeasonalProduct } from '@/lib/seasonal'
```

Find the row rendering in `NationwidePrices`. The component renders a table with product rows. Locate the cell that shows the product name (it will have `item.productName`). Wrap it to add the badge:

Find this pattern in the file (the product name cell):
```tsx
{item.productName}
```

Change to:
```tsx
<span className="flex items-center gap-1">
  {item.productName}
  {isSeasonalProduct(item.productName) && (
    <span className="text-xs" title={`${new Date().getMonth() + 1}월 제철`}>🌿</span>
  )}
</span>
```

Note: Read the file first to find the exact line — the product name will appear in a `<td>` or `<div>` cell within the table rows.

- [ ] **Step 2: Add seasonal banner to `src/app/products/[code]/page.tsx`**

Add import at top of the file:
```typescript
import { isSeasonalProduct } from '@/lib/seasonal'
```

After the breadcrumb `<div>` (around line 94, after `</div>` that closes the breadcrumb), add:

```tsx
{product && isSeasonalProduct(product.name) && (
  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm font-semibold mb-4">
    🌿 {new Date().getMonth() + 1}월 제철 품목
  </div>
)}
```

- [ ] **Step 3: Verify**

Visit `http://localhost:3000` — dashboard top movers with seasonal products should show 🌿.  
Visit `http://localhost:3000/products/[code]` for a seasonal product (e.g., a 대파 or 딸기 product code) — banner should appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/nationwide-prices.tsx src/app/products/\[code\]/page.tsx
git commit -m "feat: add seasonal badges to dashboard and product detail page"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `seasonal.ts` with `isSeasonalProduct` + `getSeasonalNames` — Task 1
- ✅ `market-coords.ts` with `getMarketCoords` fallback — Task 1
- ✅ `MarketProductPrice` type — Task 2
- ✅ `getMarketPricesForProduct` service — Task 2
- ✅ `/api/v1/markets/product-prices` route — Task 2
- ✅ `MarketsMap` Leaflet component (Option C layout) — Task 4
- ✅ `MarketsFilterTable` — Task 3
- ✅ `RegionList` extracted component — Task 5
- ✅ `/markets` page wired — Task 5
- ✅ Treemap seasonal badge — Task 6
- ✅ Table seasonal badge — Task 6
- ✅ Dashboard badge — Task 7
- ✅ Product detail banner — Task 7
- ✅ Korea-only map bounds — Task 4 (koreaBounds)
- ✅ Pin states (normal/highlight/selected/dim) — Task 4
- ✅ Table row → map pan — Task 3 (onSelect) + Task 4 (selectMarket)
- ✅ Filter status bar — Task 4
- ✅ `npm install leaflet @types/leaflet` — Task 3

**No placeholders found.**

**Type consistency:** `MarketProductPrice` defined in Task 2, used in Task 3 (`MarketsFilterTable`) and Task 4 (`MarketsMap`). `getMarketCoords(code, region)` defined in Task 1, used in Task 4. `isSeasonalProduct(name, month?)` defined in Task 1, used in Tasks 6 and 7. All consistent.
