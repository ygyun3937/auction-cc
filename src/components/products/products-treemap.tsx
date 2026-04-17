'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { select } from 'd3-selection'
import { hierarchy, treemap, treemapSquarify, HierarchyRectangularNode } from 'd3-hierarchy'
import type { NationwideProductPrice } from '@/types'
import { isSeasonalProduct } from '@/lib/seasonal'

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
      const H = Math.round(W * (W < 640 ? 0.9 : 0.55))

      const svg = select(svgRef.current)
        .attr('width', W)
        .attr('height', H)
      svg.selectAll('*').remove()

      type TreeNode = TreeRoot | TreeCategory | TreeLeaf

      const hier = hierarchy<TreeNode>(hierarchyData)
        .sum(d => ('totalVolume' in d ? d.totalVolume : 0))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

      const root: HierarchyRectangularNode<TreeNode> = treemap<TreeNode>()
        .size([W, H])
        .paddingOuter(3)
        .paddingTop(18)
        .paddingInner(2)
        .round(true)
        .tile(treemapSquarify)(hier)

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
      const cell = svg.selectAll<SVGGElement, HierarchyRectangularNode<TreeRoot | TreeCategory | TreeLeaf>>('g.leaf')
        .data(root.leaves())
        .join('g')
        .attr('class', 'leaf')
        .attr('transform', d => `translate(${d.x0},${d.y0})`)
        .style('cursor', 'pointer')

      // Attach click via DOM to avoid stale closure issue
      cell.each(function(d) {
        const code = (d.data as TreeLeaf).productCode
        select(this).on('click', () => {
          router.push(`/products/${code}`)
        })
      })

      cell.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .attr('fill', d => getColor((d.data as TreeLeaf).change1d))
        .attr('rx', 3)
        .on('mouseover', function() { select(this).attr('opacity', '0.8') })
        .on('mouseout', function() { select(this).attr('opacity', '1') })

      cell.each(function(d) {
        const item = d.data as TreeLeaf
        const w = d.x1 - d.x0
        const h = d.y1 - d.y0
        const g = select(this)
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

          if (isSeasonalProduct(item.productName)) {
            g.append('text')
              .attr('x', w - 4)
              .attr('y', 12)
              .attr('text-anchor', 'end')
              .attr('font-size', Math.min(11, w / 5))
              .attr('pointer-events', 'none')
              .text('🌿')
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
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(render, 150)
    })
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      clearTimeout(resizeTimeout)
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
