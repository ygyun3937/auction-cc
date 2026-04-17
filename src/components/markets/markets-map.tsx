'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Market, NationwideProductPrice, MarketProductPrice, ApiResponse } from '@/types'
import { isSeasonalProduct } from '@/lib/seasonal'
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
  unit: string
  isSeasonal: boolean
}

interface Props {
  markets: Market[]
  nationwide: NationwideProductPrice[]
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
  const selectMarketRef = useRef<(code: string) => void>(() => {})

  const [activeProduct, setActiveProduct] = useState<ActiveProduct | null>(null)
  const [selectedMarketCode, setSelectedMarketCode] = useState<string | null>(null)
  const [filterMarkets, setFilterMarkets] = useState<MarketProductPrice[]>([])
  const [loadingFilter, setLoadingFilter] = useState(false)

  const month = new Date().getMonth() + 1

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(entry.marker as any).setIcon(icon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(entry.marker as any).setZIndexOffset(
      state === 'selected' ? 2000 : state === 'highlight' ? 1000 : 0
    )
  }, [])

  const applyFilter = useCallback(async (prod: NationwideProductPrice, isSeasonal: boolean) => {
    setActiveProduct({ productCode: prod.productCode, productName: prod.productName, unit: prod.unit, isSeasonal })
    setSelectedMarketCode(null)
    setLoadingFilter(true)

    try {
      const res = await fetch(`/api/v1/markets/product-prices?productCode=${encodeURIComponent(prod.productCode)}`)
      const json: ApiResponse<MarketProductPrice[]> = await res.json()
      const marketPrices = json.data ?? []
      setFilterMarkets(marketPrices)

      const activeCodes = new Set(marketPrices.map(m => m.marketCode))
      markersRef.current.forEach((_, code) => {
        setMarkerState(code, activeCodes.has(code) ? 'highlight' : 'dim')
      })
    } catch {
      setFilterMarkets([])
      markersRef.current.forEach((_, code) => setMarkerState(code, 'normal'))
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(entry.marker as any).openPopup()
  }, [selectedMarketCode, filterMarkets, setMarkerState])

  useEffect(() => {
    selectMarketRef.current = selectMarket
  }, [selectMarket])

  useEffect(() => {
    if (!mapRef.current) return

    // Dynamic import to avoid SSR issues
    import('leaflet').then(({ default: L }) => {
      if (mapInstanceRef.current) return // already initialized

      // Expose L globally for icon updates after init
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).L = L

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
          <div style="font-size:13px;font-weight:700;color:#f1f5f9">${escHtml(m.name)}</div>
          <div style="font-size:11px;color:#4ade80;margin-top:2px">${escHtml(m.region)}</div>
          ${m.address ? `<div style="font-size:10px;color:#64748b;margin-top:5px">${escHtml(m.address)}</div>` : ''}
          <a href="/markets/${escHtml(m.code)}" style="display:block;margin-top:7px;font-size:11px;color:#60a5fa;border-top:1px solid #334155;padding-top:6px;text-decoration:none">→ 시장 상세 보기</a>
        `, { className: 'markets-popup' })

        const entry: MarkerEntry = { marker, code: m.code, region: m.region, name: m.name, lat: coords.lat, lng: coords.lng }
        markersRef.current.set(m.code, entry)
        marker.on('click', () => selectMarketRef.current(entry.code))
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

  function chipColor(change: number | null) {
    if (change == null || Math.abs(change) < 0.5) return 'text-gray-400 dark:text-gray-500'
    return change > 0 ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'
  }
  function fmtChg(c: number | null) {
    if (c == null) return '—'
    return (c > 0 ? '▲ ' : c < 0 ? '▼ ' : '') + Math.abs(c).toFixed(1) + '%'
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
      {/* LEFT: Filter panel */}
      <div
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col lg:sticky lg:top-4"
        style={{ maxHeight: '600px' }}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">품목 필터</span>
        </div>
        <div className="overflow-y-auto flex-1">
          {seasonalProducts.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1">
                <span className="text-xs font-bold text-green-600 dark:text-green-400">🌿 {month}월 제철</span>
              </div>
              {seasonalProducts.map(p => {
                const isActive = activeProduct?.productCode === p.productCode
                return (
                  <button
                    key={p.productCode}
                    onClick={() => isActive ? clearFilter() : applyFilter(p, true)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors border-l-2 ${
                      isActive
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-l-amber-400'
                        : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${isActive ? 'text-amber-700 dark:text-amber-300' : 'text-gray-800 dark:text-gray-200'}`}>
                      {p.productName}
                    </span>
                    <div className="text-right ml-2">
                      <div className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300">
                        {Math.round(p.todayAvg).toLocaleString()}
                        <span className="text-gray-400 dark:text-gray-500 font-normal">원/{p.unit}</span>
                      </div>
                      <div className={`text-xs font-semibold ${chipColor(p.change1d)}`}>{fmtChg(p.change1d)}</div>
                    </div>
                  </button>
                )
              })}
            </>
          )}
          <div className="h-px bg-gray-100 dark:bg-gray-700 mx-4 my-1" />
          <div className="px-4 pt-3 pb-1">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">전체 품목</span>
          </div>
          {otherProducts.slice(0, 20).map(p => {
            const isActive = activeProduct?.productCode === p.productCode
            return (
              <button
                key={p.productCode}
                onClick={() => isActive ? clearFilter() : applyFilter(p, false)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors border-l-2 ${
                  isActive
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-l-amber-400'
                    : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className={`text-sm font-semibold ${isActive ? 'text-amber-700 dark:text-amber-300' : 'text-gray-800 dark:text-gray-200'}`}>
                  {p.productName}
                </span>
                <div className="text-right ml-2">
                  <div className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300">
                    {Math.round(p.todayAvg).toLocaleString()}
                    <span className="text-gray-400 dark:text-gray-500 font-normal">원/{p.unit}</span>
                  </div>
                  <div className={`text-xs font-semibold ${chipColor(p.change1d)}`}>{fmtChg(p.change1d)}</div>
                </div>
              </button>
            )
          })}
          <div className="h-4" />
        </div>
      </div>

      {/* RIGHT: Map + Table */}
      <div className="flex flex-col gap-3">
        {activeProduct && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
            {activeProduct.isSeasonal && <span>🌿</span>}
            <span className="font-bold text-amber-700 dark:text-amber-400">{activeProduct.productName}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">원/{activeProduct.unit}</span>
            {activeProduct.isSeasonal && (
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5">
                제철
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
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

        <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
          <div ref={mapRef} style={{ width: '100%', height: '440px' }} />
        </div>

        {activeProduct && !loadingFilter && filterMarkets.length > 0 && (
          <MarketsFilterTable
            productName={activeProduct.productName}
            unit={activeProduct.unit}
            markets={filterMarkets}
            selectedCode={selectedMarketCode}
            onSelect={selectMarket}
          />
        )}
      </div>
    </div>
  )
}
