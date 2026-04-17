# Markets Map + Seasonal Badges — Design Spec

**Date:** 2026-04-17  
**Scope:** `/markets` page map redesign + seasonal badges across all pages

---

## Overview

Two features:

1. **Markets Map (Option C)**: Replace the `/markets` region list with a Leaflet map of Korea. Map overlay has two product filter strips (제철 / 전체). Selecting a product highlights markets that trade it and shows a per-market price table below. Table rows click → map pan + pin highlight.

2. **Seasonal Badges**: A static monthly lookup (`src/lib/seasonal.ts`) drives 🌿 badges on products across all pages — treemap, screener table, dashboard top movers, product detail banner.

---

## Seasonal Data

**`src/lib/seasonal.ts`** — static lookup, no DB.

```typescript
// Maps month (1–12) → array of product name substrings (case-insensitive match)
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

---

## Markets Page

### Data

**Existing:** `getAllMarkets()` returns `Market[]` with `code, name, region, address`.  
**New:** Add `getMarketPricesForProduct(productCode: string)` to `market.service.ts`.

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

export async function getMarketPricesForProduct(productCode: string): Promise<MarketProductPrice[]>
```

Queries `AuctionPrice` for the latest date this product was traded, groups by market, returns avg/min/max/volume per market. Cached with `CACHE_TTL.PRICE_LIST`.

**`src/types/index.ts`**: Export `MarketProductPrice`.

### Hardcoded Coordinates

`src/lib/market-coords.ts` — static lookup of lat/lng per market code.

```typescript
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

// Fallback: approximate region centers for unknown codes
export const REGION_CENTER_COORDS: Record<string, { lat: number; lng: number }> = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '울산': { lat: 35.5384, lng: 129.3114 },
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
```

### Components

#### `src/components/markets/markets-map.tsx` — Client Component

**Dependencies:** `leaflet` (installed via `npm install leaflet @types/leaflet`)  
**SSR:** Leaflet accesses `document` — use `useEffect` for all initialization. Import `leaflet/dist/leaflet.css` at top of file (works in Next.js app router client components).

**Props:**
```typescript
interface MarketsMapProps {
  markets: Market[]
  nationwide: NationwideProductPrice[]  // all products with prices
}
```

**Seasonal products** — derived client-side: `getSeasonalNames()` matched against `nationwide` items.

**Pin states:**
| State | Size | Color | Use |
|---|---|---|---|
| `normal` | 12px | Green `#16a34a` | Default |
| `highlight` | 16px | Amber `#f59e0b` | Trades selected product |
| `selected` | 18px | Rose `#e11d48` | Clicked in table or map |
| `dim` | 8px | Gray `#374151` | Doesn't trade selected product |

All pins are `L.divIcon` (no default Leaflet marker icons needed).

**Map constraints:**
```javascript
bounds: [[33.0, 124.5], [38.6, 130.5]]  // Korea only
minZoom: 6, maxZoom: 12
maxBoundsViscosity: 1.0
```

**Overlay layout (bottom of map):**
```
[ 🌿 4월 제철 ]  딸기  봄배추  냉이  두릅  주꾸미  →
─────────────────────────────────────────────────
[ 전체 품목  ]  배추  대파  당근  사과  양파  귤  →
```
Two horizontally scrollable strips. Clicking either strip item triggers filter.

**Filter behavior:**
- Selected product → highlight matching market pins, dim others
- Show filter status bar above map (product name, count, change %)
- Show `MarketsFilterTable` below map

**Interaction:**
- Map pin click → popup (market name, region, product price if filter active) + highlight table row + pan
- Table row click → pan map to marker, open popup, highlight pin as `selected`
- Clear filter → reset all pins to `normal`, hide table

#### `src/components/markets/markets-filter-table.tsx` — Client Component

Shown only when a product filter is active.

**Props:**
```typescript
interface MarketsFilterTableProps {
  markets: MarketProductPrice[]
  selectedMarketCode: string | null
  onSelectMarket: (code: string) => void
}
```

**Columns:** 시장 (name + region) | 현재가 | 등락 (% + 원)  
**Sorting:** default by avgPrice desc  
**Row click:** calls `onSelectMarket(code)` → parent pans map

#### `src/app/api/v1/markets/product-prices/route.ts` — New API Route

```
GET /api/v1/markets/product-prices?productCode=XXX
```

Called by the client map component when user selects a product. Returns `MarketProductPrice[]`. Secured via same pattern as other routes (no auth needed — read-only public data).

#### `src/app/markets/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

export default async function MarketsPage() {
  const [markets, nationwide] = await Promise.all([
    getAllMarkets(),
    getNationwidePrices(),
  ])

  return (
    <div>
      <PageHeader />
      <MarketsMap markets={markets} nationwide={nationwide} />
      {/* existing region list below */}
      <RegionList markets={markets} />
    </div>
  )
}
```

`RegionList` = extract the existing region-grouped list into a separate server component (`src/components/markets/region-list.tsx`).

---

## Seasonal Badges — Other Pages

### Products Page (`products-treemap.tsx` + `products-table.tsx`)

`isSeasonalProduct(item.productName)` checked per item.

**Treemap:** For leaf cells wide enough (w ≥ 44, h ≥ 38), append a small `🌿` text element at top-right corner of the cell.

**Table:** In the 품목 column, append `<span>🌿</span>` after the product name if seasonal.

### Dashboard (`DashboardClient`)

Find `DashboardClient` and add 🌿 to top movers list items where `isSeasonalProduct(productName)`.

### Product Detail Page (`/products/[code]/page.tsx`)

Below the product name/header, add a banner if seasonal:
```tsx
{isSeasonalProduct(product.name) && (
  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm font-semibold mb-4">
    🌿 {new Date().getMonth() + 1}월 제철 품목
  </div>
)}
```

---

## Dependencies

```bash
npm install leaflet @types/leaflet
```

(No `react-leaflet` — using vanilla Leaflet in `useEffect` like D3 treemap pattern already in this codebase.)

---

## What's NOT changing

- `price.service.ts` — no changes
- `product.service.ts` — no changes  
- Prisma schema — no changes
- `/products/[code]` routing — untouched (only add seasonal badge)
- Treemap + table behavior — no logic changes, only visual badge addition
