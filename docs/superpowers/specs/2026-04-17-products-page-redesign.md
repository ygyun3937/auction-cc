# Products Page Redesign — Design Spec

**Date:** 2026-04-17  
**Scope:** `/products` page UI only — no new API routes, no schema changes

---

## Overview

Replace the current dense text grid (name + unit only) with a two-section layout:

1. **Top — Squarified Treemap**: finviz-style heatmap. Box size = trading volume, color = 1-day price change. Grouped by category. Rendered client-side with D3.js.
2. **Bottom — Stock Screener Table**: Kakao Securities / Toss Securities style. Category tabs for navigation. Columns: 품목, 현재가, 등락(금액 + %).

Color convention follows Korean stock market:  
- Red (빨강) = price up  
- Blue (파랑) = price down  
- Gray = flat (±0.5% 미만)

---

## Data

**Source:** Reuse existing `getNationwidePrices()` from `price.service.ts`.  
Returns `NationwideProductPrice[]` which already includes:

| Field | Use |
|---|---|
| `productCode`, `productName` | Item identity |
| `categoryCode`, `categoryName` | Grouping |
| `unit` | Display label |
| `todayAvg` | Current price (현재가) |
| `totalVolume` | Treemap box size |
| `change1d` | Color + change % display |
| `priceDate` | "기준" date label |

No new service function or DB query needed. Redis-cached, same data as dashboard.

---

## Components

### 1. `src/components/products/products-treemap.tsx` (Client Component)

**Props:** `data: NationwideProductPrice[]`

**Behavior:**
- Builds a 2-level D3 hierarchy: root → categories → products
- Renders as a **single unified treemap** (one SVG) — categories are parent nodes, products are leaf nodes
- `d3.treemap().paddingTop(18).paddingOuter(3).paddingInner(2).tile(d3.treemapSquarify)`
- Category areas: dark background (`#1f2937`) + green label text at top-left
- Leaf cells: colored by `change1d`, show 품목명 / 현재가 / 등락% (font scales with box size; omit text if too small)
- Click on leaf → `router.push('/products/{code}')`
- `useEffect` + `useRef` for D3 rendering; re-renders on window resize (debounced 150ms)
- D3 imported as `import * as d3 from 'd3'`

**Color scale for `change1d`:**

| Range | Color |
|---|---|
| ≥ +5% | `#b91c1c` (dark red) |
| +2% ~ +5% | `#ef4444` |
| +0.5% ~ +2% | `#fca5a5` (light red) |
| ±0.5% | `#6b7280` (gray) |
| -0.5% ~ -2% | `#93c5fd` (light blue) |
| -2% ~ -5% | `#3b82f6` |
| ≤ -5% | `#1d4ed8` (dark blue) |

Text color: white for saturated cells, dark red/dark blue for light cells, `#d1d5db` for gray.

**Legend:** Small horizontal legend below treemap (상승/하락/보합 + 박스크기=거래량 note).

---

### 2. `src/components/products/products-table.tsx` (Client Component)

**Props:** `data: NationwideProductPrice[]`

**Behavior:**
- Derives unique categories from data; renders horizontal scrollable tab bar
- Selected tab state via `useState` (default: first category)
- Filters table rows by selected category
- Default sort: `change1d` descending (biggest gainers first, like stock screener)
- Column header clicks toggle sort (name / price / change)

**Table columns:**

| Column | Content |
|---|---|
| 품목 | Name + unit (subtext) |
| 현재가 | `todayAvg` — colored red/blue/gray |
| 등락 | Change amount (원) on top, change % below, both colored |

Row click → `router.push('/products/{code}')`

**Empty state:** `change1d` may be null for some products (no previous day data). Show `—` in change column.

---

## Page Changes

**`src/app/products/page.tsx`:**

- Replace `getAllProducts()` call with `getNationwidePrices()`
- Pass result to `<ProductsTreemap>` and `<ProductsTable>` as props
- Remove category grouping logic (moved to client components)
- Keep `export const dynamic = 'force-dynamic'`

**Layout:**
```
<div>
  <PageHeader />
  <ProductsTreemap data={nationwide} />   {/* top */}
  <div className="mt-6">
    <ProductsTable data={nationwide} />   {/* bottom */}
  </div>
</div>
```

---

## Dependencies

- `d3` — not currently in `package.json`. Must install: `npm install d3 @types/d3`

## Change Amount Calculation

`getNationwidePrices()` returns `change1d` as a percentage (e.g., `3.2` = +3.2%).  
Change amount in 원 is computed client-side:  
```
changeAmount = Math.round(todayAvg * change1d / 100)
```
Example: todayAvg=4,100, change1d=8.17 → changeAmount=+335원

---

## What's NOT changing

- `/products/[code]` detail page — untouched
- `price.service.ts` — no changes
- `product.service.ts` — no changes
- Prisma schema — no changes
- All other pages — untouched
