// API Response wrapper
export interface ApiResponse<T> {
  data: T
  meta: {
    total?: number
    page?: number
    limit?: number
    updatedAt?: string
  }
  error?: {
    code: string
    message: string
  }
}

// Market types
export interface Market {
  id: number
  code: string
  name: string
  region: string
  address?: string | null
}

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

// Product types
export interface ProductCategory {
  id: number
  code: string
  name: string
}

export interface Product {
  id: number
  code: string
  name: string
  unit: string
  unitQty: number
  category: ProductCategory
}

// Price types
export interface AuctionPrice {
  id: number
  marketId: number
  productId: number
  auctionDate: string
  grade: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  volume: number
  unit: string
  market: Market
  product: Product
}

export interface DailyPrice {
  id: number
  productId: number
  priceDate: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalVolume: number
  changeRate: number | null
  product?: Product
}

export interface PriceTrend {
  date: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  volume: number
}

export interface PriceSummary {
  productCode: string
  productName: string
  unit: string
  latestPrice: number
  changeRate: number | null
  priceDate: string
}

export interface NationwideProductPrice {
  productCode: string
  productName: string
  categoryCode: string
  categoryName: string
  unit: string
  unitQty: number
  todayAvg: number
  totalVolume: number
  todayMin: number
  todayMax: number
  change1d: number | null
  change7d: number | null
  priceDate: string
  excludedMarkets: number
}

export interface GradePrice {
  gradeCode: string
  gradeName: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalVolume: number
  priceDate: string
}

export interface VarietyPrice {
  varietyCode: string
  varietyName: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalVolume: number
  priceDate: string
}

export interface OriginPrice {
  originName: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalVolume: number
  priceDate: string
}

// Dashboard types
export interface DashboardSummary {
  totalMarkets: number
  totalProducts: number
  latestUpdate: string
  topMovers: PriceSummary[]
  recentAuctions: AuctionPrice[]
}

// Search types
export interface SearchResult {
  products: Product[]
  markets: Market[]
}

// API query params
export interface PriceQueryParams {
  marketCode?: string
  productCode?: string
  startDate?: string
  endDate?: string
  grade?: string
  page?: number
  limit?: number
}

export interface PriceTrendParams {
  productCode: string
  marketCode?: string
  days?: number
  groupBy?: 'day' | 'week' | 'month'
}

// External API types
export interface PublicDataAuctionItem {
  saleDate: string
  whsalCd: string
  whsalNm: string
  largeCd: string
  largeNm: string
  middleCd: string
  middleNm: string
  sanCd: string
  sanNm: string
  gradeName: string
  totAmt: number
  qty: number
  avgAmt: number
  minAmt: number
  maxAmt: number
  unit: string
}

export interface KamisPriceItem {
  productno: string
  itemname: string
  kindname: string
  graderank: string
  countyname: string
  marketname: string
  yyyy: string
  regday: string
  price: string
  unit: string
}
