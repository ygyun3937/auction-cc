'use client'

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import type { PriceTrend } from '@/types'

interface Props {
  data: PriceTrend[]
  productName: string
  unitQty?: number
  unit?: string
}

export function PriceTrendChart({ data, productName: _productName, unitQty = 1, unit = 'kg' }: Props) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        가격 추이 데이터가 없습니다
      </div>
    )
  }

  const isDark = mounted && resolvedTheme === 'dark'
  const gridColor = isDark ? '#374151' : '#f0f0f0'
  const axisColor = isDark ? '#6b7280' : '#9ca3af'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb'
  const tooltipText = isDark ? '#f3f4f6' : '#111827'
  const barColor = isDark ? '#374151' : '#e5e7eb'

  const formatted = data.map(d => ({
    ...d,
    date: d.date.slice(5),
    avgPrice: Math.round(d.avgPrice),
    minPrice: Math.round(d.minPrice),
    maxPrice: Math.round(d.maxPrice),
  }))

  const volumeLabel = unitQty > 1 ? `박스 (×${unitQty}${unit})` : `박스`

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={formatted} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: gridColor }} tickLine={{ stroke: gridColor }} />
        <YAxis
          yAxisId="price"
          tick={{ fontSize: 11, fill: axisColor }}
          axisLine={{ stroke: gridColor }}
          tickLine={{ stroke: gridColor }}
          tickFormatter={v => `${v.toLocaleString()}원`}
          width={80}
        />
        <YAxis
          yAxisId="volume"
          orientation="right"
          tick={{ fontSize: 11, fill: axisColor }}
          axisLine={{ stroke: gridColor }}
          tickLine={{ stroke: gridColor }}
          tickFormatter={v => `${v.toLocaleString()}`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: '8px',
            fontSize: '12px',
            color: tooltipText,
          }}
          labelStyle={{ color: tooltipText, marginBottom: 4 }}
          formatter={(value, name) => {
            if (name === 'volume') return [`${Number(value).toLocaleString()}${volumeLabel}`, '거래량']
            if (name === 'avgPrice') return [`${Math.round(Number(value)).toLocaleString()}원`, '평균가']
            if (name === 'minPrice') return [`${Math.round(Number(value)).toLocaleString()}원`, '최저가']
            if (name === 'maxPrice') return [`${Math.round(Number(value)).toLocaleString()}원`, '최고가']
            return [value, name]
          }}
          labelFormatter={(label) => `날짜: ${label}`}
        />
        <Legend
          formatter={value =>
            value === 'avgPrice' ? '평균가' : value === 'minPrice' ? '최저가' : value === 'maxPrice' ? '최고가' : `거래량`
          }
          wrapperStyle={{ fontSize: '12px', color: axisColor }}
        />
        <Bar yAxisId="volume" dataKey="volume" fill={barColor} opacity={0.6} radius={[2, 2, 0, 0]} />
        <Line yAxisId="price" type="monotone" dataKey="maxPrice" stroke="#ef4444" strokeWidth={1.5} dot={false} />
        <Line yAxisId="price" type="monotone" dataKey="avgPrice" stroke="#16a34a" strokeWidth={2} dot={false} />
        <Line yAxisId="price" type="monotone" dataKey="minPrice" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
