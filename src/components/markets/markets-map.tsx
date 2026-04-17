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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(entry.marker as any).setIcon(icon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(entry.marker as any).setZIndexOffset(
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(entry.marker as any).openPopup()
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
