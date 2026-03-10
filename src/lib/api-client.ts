import ky from 'ky'
import type { KamisPriceItem } from '@/types'

// 공공데이터포털 - 전국 공영도매시장 실시간 경매정보 (B552845/katRealTime2)
const PUBLIC_DATA_BASE_URL = 'https://apis.data.go.kr/B552845/katRealTime2'
const KAMIS_BASE_URL = 'https://www.kamis.or.kr/service/price/xml.do'

// 실제 API 응답 필드 (katRealTime2/trades2)
export interface KatRealTimeItem {
  auctn_seq: string       // 경매순번
  whsl_mrkt_cd: string   // 도매시장코드
  whsl_mrkt_nm: string   // 도매시장명
  corp_nm: string        // 법인명
  gds_lclsf_cd: string   // 대분류코드
  gds_lclsf_nm: string   // 대분류명
  gds_mclsf_cd: string   // 중분류코드
  gds_mclsf_nm: string   // 중분류명 (품목명)
  gds_sclsf_cd: string   // 소분류코드
  gds_sclsf_nm: string   // 소분류명 (품종명)
  plor_nm: string        // 산지명
  qty: string            // 거래물량
  scsbd_prc: string      // 낙찰가격
  trd_clcln_ymd: string  // 거래정산일자 (YYYY-MM-DD)
  trd_se: string         // 거래구분 (경매/정가수의)
  unit_nm: string        // 단위
  unit_qty: string       // 단위중량
  pkg_nm: string         // 포장명
}

export interface KatRealTimeResponse {
  response: {
    header: { resultCode: string; resultMsg: string }
    body: {
      items: { item: KatRealTimeItem[] } | null
      numOfRows: number
      pageNo: number
      totalCount: number
    }
  }
}

export interface KamisResponse {
  data: {
    error_code: string
    item?: KamisPriceItem[]
  }
}

// 공공데이터포털 경매정보 API (실제 엔드포인트)
export async function fetchAuctionData(params: {
  saleDate: string   // YYYY-MM-DD
  whsalCd?: string   // 도매시장코드
  pageNo?: number
  numOfRows?: number
}): Promise<KatRealTimeItem[]> {
  const apiKey = process.env.PUBLIC_DATA_API_KEY
  if (!apiKey || apiKey === 'YOUR_PUBLIC_DATA_API_KEY') {
    console.warn('[api-client] PUBLIC_DATA_API_KEY not set, returning mock data')
    return getMockAuctionData(params.saleDate)
  }

  try {
    const url = new URL(`${PUBLIC_DATA_BASE_URL}/trades2`)
    url.searchParams.set('serviceKey', apiKey)
    url.searchParams.set('cond[trd_clcln_ymd::EQ]', params.saleDate)
    url.searchParams.set('pageNo', String(params.pageNo || 1))
    url.searchParams.set('numOfRows', String(params.numOfRows || 1000))
    url.searchParams.set('returnType', 'json')
    if (params.whsalCd) url.searchParams.set('cond[whsl_mrkt_cd::EQ]', params.whsalCd)

    const response = await ky
      .get(url.toString(), { timeout: 30000 })
      .json<KatRealTimeResponse>()

    if (response?.response?.header?.resultCode !== '0') {
      console.error('[api-client] API error:', response?.response?.header)
      return []
    }

    const items = response?.response?.body?.items?.item
    return Array.isArray(items) ? items : []
  } catch (error) {
    console.error('[api-client] fetchAuctionData error:', error)
    return []
  }
}

export interface KamisGradeItem {
  itemcategorycode: string   // 부류코드
  itemcode: string           // 품목코드
  kindcode: string           // 품종코드
  productrankcode: string    // 등급코드 (01=특, 02=상, 03=중, 04=하, 05=등외)
  countycode: string         // 지역코드
  yyyy: string               // 연도
  regday: string             // 날짜 (MM/DD)
  price: string              // 가격
}

// KAMIS 도매 등급별 가격 (periodProductList)
export async function fetchKamisGradePrices(params: {
  itemCategoryCode: string  // 부류코드 (예: 400=과실류, 200=채소류)
  itemCode: string          // 품목코드 (예: 411=사과)
  kindCode?: string         // 품종코드 (00=전체)
  gradeCode?: string        // 등급코드 (01=특, 02=상, 03=중, 04=하)
  startDate: string
  endDate: string
  countryCode?: string      // 지역코드 (빈값=전국)
}): Promise<KamisGradeItem[]> {
  const apiKey = process.env.KAMIS_API_KEY
  const apiId = process.env.KAMIS_API_ID
  if (!apiKey || apiKey === 'YOUR_KAMIS_API_KEY') return []

  try {
    const searchParams = new URLSearchParams({
      action: 'periodProductList',
      p_cert_key: apiKey,
      p_cert_id: apiId || '',
      p_returntype: 'json',
      p_productclscode: '02',  // 도매
      p_itemcategorycode: params.itemCategoryCode,
      p_itemcode: params.itemCode,
      p_kindcode: params.kindCode || '00',
      p_productrankcode: params.gradeCode || '',
      p_startday: params.startDate,
      p_endday: params.endDate,
      p_countrycode: params.countryCode || '',
      p_convert_kg_yn: 'N',
    })

    const response = await ky
      .get(KAMIS_BASE_URL, { searchParams, timeout: 30000 })
      .json<{ data?: { item?: KamisGradeItem[] }; error_code?: string }>()

    return response?.data?.item || []
  } catch (error) {
    console.error('[api-client] fetchKamisGradePrices error:', error)
    return []
  }
}

// KAMIS 현재가 조회 (dailySalesList)
export async function fetchKamisPrices(params: {
  productNo: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  countryCode?: string
}): Promise<KamisPriceItem[]> {
  const apiKey = process.env.KAMIS_API_KEY
  const apiId = process.env.KAMIS_API_ID
  if (!apiKey || apiKey === 'YOUR_KAMIS_API_KEY') {
    console.warn('[api-client] KAMIS_API_KEY not set, returning mock data')
    return []
  }

  try {
    const searchParams = new URLSearchParams({
      action: 'dailySalesList',
      p_cert_key: apiKey,
      p_cert_id: apiId || '',
      p_returntype: 'json',
      p_productno: params.productNo,
      p_startday: params.startDate,
      p_endday: params.endDate,
      p_countrycode: params.countryCode || '',
    })

    const response = await ky
      .get(KAMIS_BASE_URL, { searchParams, timeout: 30000 })
      .json<KamisResponse>()

    return response?.data?.item || []
  } catch (error) {
    console.error('[api-client] fetchKamisPrices error:', error)
    return []
  }
}

// Mock data for development (API 키 없을 때) - KatRealTimeItem 형식
function getMockAuctionData(saleDate: string): KatRealTimeItem[] {
  const products = [
    { mclsf_cd: '01', mclsf_nm: '배추', lclsf_cd: '01', lclsf_nm: '엽채류', unit: 'kg', unit_qty: '10' },
    { mclsf_cd: '02', mclsf_nm: '무', lclsf_cd: '01', lclsf_nm: '근채류', unit: 'kg', unit_qty: '20' },
    { mclsf_cd: '14', mclsf_nm: '사과', lclsf_cd: '06', lclsf_nm: '과실류', unit: 'kg', unit_qty: '10' },
    { mclsf_cd: '15', mclsf_nm: '배', lclsf_cd: '06', lclsf_nm: '과실류', unit: 'kg', unit_qty: '15' },
    { mclsf_cd: '16', mclsf_nm: '감귤', lclsf_cd: '06', lclsf_nm: '과실류', unit: 'kg', unit_qty: '10' },
    { mclsf_cd: '07', mclsf_nm: '대파', lclsf_cd: '01', lclsf_nm: '엽채류', unit: 'kg', unit_qty: '1' },
    { mclsf_cd: '08', mclsf_nm: '양파', lclsf_cd: '01', lclsf_nm: '근채류', unit: 'kg', unit_qty: '20' },
    { mclsf_cd: '18', mclsf_nm: '수박', lclsf_cd: '06', lclsf_nm: '과실류', unit: '개', unit_qty: '1' },
  ]
  const markets = [
    { cd: '110001', nm: '서울가락시장' },
    { cd: '110002', nm: '서울강서시장' },
    { cd: '210001', nm: '부산엄궁시장' },
    { cd: '230001', nm: '대구북부시장' },
    { cd: '240001', nm: '광주각화시장' },
  ]

  let seq = 1
  return products.flatMap(p =>
    markets.flatMap(m =>
      Array.from({ length: 3 }, () => ({
        auctn_seq: String(seq++).padStart(5, '0'),
        whsl_mrkt_cd: m.cd,
        whsl_mrkt_nm: m.nm,
        corp_nm: '테스트법인',
        gds_lclsf_cd: p.lclsf_cd,
        gds_lclsf_nm: p.lclsf_nm,
        gds_mclsf_cd: p.mclsf_cd,
        gds_mclsf_nm: p.mclsf_nm,
        gds_sclsf_cd: '01',
        gds_sclsf_nm: p.mclsf_nm,
        plor_nm: '국산',
        qty: String(Math.floor(Math.random() * 100) + 10),
        scsbd_prc: String(Math.floor(Math.random() * 30000) + 5000),
        trd_clcln_ymd: saleDate,
        trd_se: '경매',
        unit_nm: p.unit,
        unit_qty: p.unit_qty,
        pkg_nm: '상자',
      }))
    )
  )
}
