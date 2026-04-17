# Products Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/products` page grid with a finviz-style unified hierarchical treemap (top) + stock-screener table with category tabs (bottom).

**Architecture:** Server component fetches `getNationwidePrices()` and passes `NationwideProductPrice[]` to two new client components. `ProductsTreemap` renders a single D3 hierarchical treemap (categories → products). `ProductsTable` renders a sortable table with category tabs.

**Tech Stack:** Next.js 15, React 19, D3 v7, TypeScript, Tailwind CSS

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Install | `package.json` | Add `d3`, `@types/d3` |
| Create | `src/components/products/products-treemap.tsx` | D3 hierarchical treemap client component |
| Create | `src/components/products/products-table.tsx` | Category tabs + stock-screener table client component |
| Modify | `src/app/products/page.tsx` | Switch to `getNationwidePrices()`, render new components |
| Modify | `.gitignore` | Add `.superpowers/` |

---

## Task 1: Install D3 and add .gitignore entry

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.gitignore`

- [ ] **Step 1: Install d3**

```bash
npm install d3 @types/d3
```

Expected: `package.json` now contains `"d3"` and `"@types/d3"` entries.

- [ ] **Step 2: Add .superpowers to .gitignore**

Open `.gitignore` and append:
```
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: install d3 for treemap, gitignore .superpowers"
```

---

## Task 2: Create ProductsTreemap component

**Files:**
- Create: `src/components/products/products-treemap.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as d3 from 'd3'
import type { NationwideProductPrice } from '@/types'

function getColor(change: number | null): string {
  if (change == null) return '#374151'
  if (change >= 5)    return '#b91c1c'
  if (change >= 2)    return '#ef4444'
  if (change >= 0.5)  return '#fca5a5'
  if (change > -0.5)  return '#4b5563'
  if (change > -2)    return '#93c5fd'
  if (change > -5)    return '#3b82f6'
  return '#1d4ed8'
}

function getTextColor(change: number | null): string {
  if (change == null || Math.abs(change) < 0.5) return '#d1d5db'
  if (change > 0) return change >= 2 ? 'white' : '#7f1d1d'
  return change <= -2 ? 'white' : '#1e3a8a'
}

interface TreeLeaf extends NationwideProductPrice {
  children?: undefined
}
interface TreeCategory {
  name: string
  categoryCode: string
  children: TreeLeaf[]
}
interface TreeRoot {
  name: string
  children: TreeCategory[]
}

export function ProductsTreemap({ data }: { data: NationwideProductPrice[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return

    function render() {
      if (!svgRef.current || !containerRef.current) return

      // Build hierarchy data
      const categoryMap = new Map<string, TreeCategory>()
      for (const p of data) {
        if (!categoryMap.has(p.categoryCode)) {
          categoryMap.set(p.categoryCode, {
            name: p.categoryName,
            categoryCode: p.categoryCode,
            children: [],
          })
        }
        categoryMap.get(p.categoryCode)!.children.push(p as TreeLeaf)
      }
      const hierarchyData: TreeRoot = {
        name: '전체',
        children: Array.from(categoryMap.values()),
      }

      const W = containerRef.current.clientWidth
      const H = Math.round(W * 0.55)

      const svg = d3.select(svgRef.current)
        .attr('width', W)
        .attr('height', H)
      svg.selectAll('*').remove()

      const root = d3.hierarchy<TreeRoot | TreeCategory | TreeLeaf>(hierarchyData)
        .sum(d => ('totalVolume' in d ? d.totalVolume : 0))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

      d3.treemap<TreeRoot | TreeCategory | TreeLeaf>()
        .size([W, H])
        .paddingOuter(3)
        .paddingTop(18)
        .paddingInner(2)
        .round(true)
        .tile(d3.treemapSquarify)(root)

      // Category parent backgrounds + labels
      const parents = root.children ?? []
      parents.forEach(p => {
        svg.append('rect')
          .attr('x', p.x0).attr('y', p.y0)
          .attr('width', p.x1 - p.x0).attr('height', p.y1 - p.y0)
          .attr('fill', '#1f2937')
          .attr('rx', 4)

        if (p.x1 - p.x0 > 30) {
          svg.append('text')
            .attr('x', p.x0 + 5).attr('y', p.y0 + 13)
            .attr('font-size', Math.min(11, (p.x1 - p.x0) / 6))
            .attr('font-weight', '700')
            .attr('fill', '#4ade80')
            .text((p.data as TreeCategory).name)
        }
      })

      // Leaf cells
      const cell = svg.selectAll<SVGGElement, d3.HierarchyRectangularNode<TreeRoot | TreeCategory | TreeLeaf>>('g.leaf')
        .data(root.leaves())
        .join('g')
        .attr('class', 'leaf')
        .attr('transform', d => `translate(${d.x0},${d.y0})`)
        .style('cursor', 'pointer')

      // Attach click via DOM to avoid stale closure issue
      cell.each(function(d) {
        const code = (d.data as TreeLeaf).productCode
        d3.select(this).on('click', () => {
          router.push(`/products/${code}`)
        })
      })

      cell.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .attr('fill', d => getColor((d.data as TreeLeaf).change1d))
        .attr('rx', 3)
        .on('mouseover', function() { d3.select(this).attr('opacity', '0.8') })
        .on('mouseout', function() { d3.select(this).attr('opacity', '1') })

      cell.each(function(d) {
        const item = d.data as TreeLeaf
        const w = d.x1 - d.x0
        const h = d.y1 - d.y0
        const g = d3.select(this)
        const tc = getTextColor(item.change1d)

        if (w >= 44 && h >= 38) {
          g.append('text')
            .attr('x', w / 2).attr('y', h / 2 - (h >= 54 ? 14 : 7))
            .attr('text-anchor', 'middle').attr('fill', tc)
            .attr('font-size', Math.min(13, w / 4.5))
            .attr('font-weight', '700')
            .attr('pointer-events', 'none')
            .text(item.productName)

          if (h >= 50) {
            g.append('text')
              .attr('x', w / 2).attr('y', h / 2 + 3)
              .attr('text-anchor', 'middle').attr('fill', tc)
              .attr('font-size', Math.min(12, w / 5))
              .attr('font-weight', '800')
              .attr('pointer-events', 'none')
              .text(Math.round(item.todayAvg).toLocaleString())
          }

          if (h >= 64) {
            const sign = (item.change1d ?? 0) > 0 ? '+' : ''
            g.append('text')
              .attr('x', w / 2).attr('y', h / 2 + 17)
              .attr('text-anchor', 'middle').attr('fill', tc).attr('opacity', '0.85')
              .attr('font-size', Math.min(11, w / 5.5))
              .attr('font-weight', '600')
              .attr('pointer-events', 'none')
              .text(item.change1d != null ? `${sign}${item.change1d.toFixed(1)}%` : '—')
          }
        } else if (w >= 28 && h >= 22) {
          g.append('text')
            .attr('x', w / 2).attr('y', h / 2)
            .attr('text-anchor', 'middle').attr('fill', tc)
            .attr('font-size', Math.min(10, w / 3.5))
            .attr('font-weight', '700')
            .attr('pointer-events', 'none')
            .text(item.productName)
        }
      })
    }

    render()

    let resizeTimeout: ReturnType<typeof setTimeout>
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(render, 150)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(resizeTimeout)
      window.removeEventListener('resize', handleResize)
    }
  }, [data, router])

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} style={{ display: 'block', borderRadius: '10px', width: '100%' }} />
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {[
          { color: '#b91c1c', label: '급등 +5%↑' },
          { color: '#ef4444', label: '상승' },
          { color: '#fca5a5', label: '소폭상승' },
          { color: '#4b5563', label: '보합' },
          { color: '#93c5fd', label: '소폭하락' },
          { color: '#3b82f6', label: '하락' },
          { color: '#1d4ed8', label: '급락 -5%↓' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">· 박스크기 = 거래량</span>
      </div>
    </div>
  )
}
```

Save to `src/components/products/products-treemap.tsx`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/products/products-treemap.tsx
git commit -m "feat: add ProductsTreemap component with D3 hierarchical treemap"
```

---

## Task 3: Create ProductsTable component

**Files:**
- Create: `src/components/products/products-table.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NationwideProductPrice } from '@/types'

type SortKey = 'name' | 'price' | 'change'

function getPriceColorClass(change: number | null): string {
  if (change == null || Math.abs(change) < 0.5) return 'text-gray-400 dark:text-gray-500'
  return change > 0 ? 'text-red-500' : 'text-blue-500'
}

export function ProductsTable({ data }: { data: NationwideProductPrice[] }) {
  const router = useRouter()

  const categories = Array.from(
    new Map(data.map(p => [p.categoryCode, p.categoryName])).entries()
  )

  const [activeCategory, setActiveCategory] = useState(categories[0]?.[0] ?? '')
  const [sortKey, setSortKey] = useState<SortKey>('change')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = data.filter(p => p.categoryCode === activeCategory)
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (sortKey === 'name') diff = a.productName.localeCompare(b.productName, 'ko')
    else if (sortKey === 'price') diff = a.todayAvg - b.todayAvg
    else diff = (a.change1d ?? -Infinity) - (b.change1d ?? -Infinity)
    return sortDir === 'asc' ? diff : -diff
  })

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null
    return sortDir === 'desc' ? ' ↓' : ' ↑'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Category tabs */}
      <div className="overflow-x-auto border-b border-gray-100 dark:border-gray-700">
        <div className="flex min-w-max">
          {categories.map(([code, name]) => (
            <button
              key={code}
              onClick={() => setActiveCategory(code)}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeCategory === code
                  ? 'text-green-600 dark:text-green-400 border-green-500'
                  : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <th className="px-4 py-2.5 text-left">
              <button
                onClick={() => handleSort('name')}
                className="text-xs text-gray-400 dark:text-gray-500 font-semibold hover:text-gray-700 dark:hover:text-gray-300"
              >
                품목{sortIndicator('name')}
              </button>
            </th>
            <th className="px-4 py-2.5 text-right">
              <button
                onClick={() => handleSort('price')}
                className="text-xs text-gray-400 dark:text-gray-500 font-semibold hover:text-gray-700 dark:hover:text-gray-300"
              >
                현재가{sortIndicator('price')}
              </button>
            </th>
            <th className="px-4 py-2.5 text-right">
              <button
                onClick={() => handleSort('change')}
                className={`text-xs font-semibold hover:text-red-400 ${
                  sortKey === 'change' ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                등락{sortIndicator('change')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {sorted.map(p => {
            const changeAmt =
              p.change1d != null ? Math.round((p.todayAvg * p.change1d) / 100) : null
            const colorClass = getPriceColorClass(p.change1d)

            return (
              <tr
                key={p.productCode}
                onClick={() => router.push(`/products/${p.productCode}`)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {p.productName}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">원/{p.unit}</div>
                </td>
                <td className={`px-4 py-3 text-right text-base font-bold tabular-nums ${colorClass}`}>
                  {Math.round(p.todayAvg).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.change1d != null ? (
                    <>
                      <div className={`text-sm font-bold tabular-nums ${colorClass}`}>
                        {changeAmt != null
                          ? `${changeAmt > 0 ? '+' : ''}${changeAmt.toLocaleString()}`
                          : '—'}
                      </div>
                      <div className={`text-xs font-semibold ${colorClass}`}>
                        {p.change1d > 0 ? '+' : ''}
                        {p.change1d.toFixed(2)}%
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>
                  )}
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

Save to `src/components/products/products-table.tsx`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/products/products-table.tsx
git commit -m "feat: add ProductsTable component with category tabs and stock-screener layout"
```

---

## Task 4: Update products page

**Files:**
- Modify: `src/app/products/page.tsx`

- [ ] **Step 1: Replace page content**

Replace the entire contents of `src/app/products/page.tsx` with:

```tsx
import { getNationwidePrices } from '@/services/price.service'
import { ProductsTreemap } from '@/components/products/products-treemap'
import { ProductsTable } from '@/components/products/products-table'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  let nationwide: Awaited<ReturnType<typeof getNationwidePrices>> = []
  try {
    nationwide = await getNationwidePrices()
  } catch {
    // DB not ready
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">품목별 가격</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          전국 공영도매시장 품목별 경매 가격 정보
        </p>
      </div>

      {nationwide.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p>품목 데이터가 없습니다. 첫 데이터 수집 후 표시됩니다.</p>
        </div>
      ) : (
        <>
          <ProductsTreemap data={nationwide} />
          <div className="mt-6">
            <ProductsTable data={nationwide} />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build succeeds, `/products` shows `ƒ (Dynamic)` in output.

- [ ] **Step 3: Commit**

```bash
git add src/app/products/page.tsx
git commit -m "feat: redesign products page with treemap + stock-screener table"
```

---

## Task 5: Push and verify on production

- [ ] **Step 1: Push to trigger deploy**

```bash
git push
```

- [ ] **Step 2: After deploy, open https://farm.dooyg.store/products**

Verify:
- Treemap renders with colored boxes, category labels in green
- Box sizes visually reflect trading volume differences
- Table below shows category tabs, columns: 품목/현재가/등락
- Clicking a product navigates to `/products/{code}`
- Clicking a column header changes sort direction
