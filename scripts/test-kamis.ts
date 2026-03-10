import ky from 'ky'

const API_KEY = process.env.KAMIS_API_KEY!
const API_ID = process.env.KAMIS_API_ID!
const BASE = 'https://www.kamis.or.kr/service/price/xml.do'

async function main() {
  // Test with 사과 (productno=111) - 도매 가격, 등급별
  const params = new URLSearchParams({
    action: 'dailySalesList',
    p_cert_key: API_KEY,
    p_cert_id: API_ID,
    p_returntype: 'json',
    p_productno: '111', // 사과
    p_startday: '2026-03-01',
    p_endday: '2026-03-09',
    p_countrycode: '',
  })

  try {
    const res = await ky.get(`${BASE}?${params}`, { timeout: 15000 }).json<any>()
    console.log('resultCode:', res?.data?.error_code)
    const items = res?.data?.item
    if (items?.length > 0) {
      console.log('fields:', Object.keys(items[0]).join(', '))
      console.log('sample:', JSON.stringify(items[0], null, 2))
      // Show grade breakdown
      const grades = new Set(items.map((i: any) => i.graderank))
      console.log('grades:', [...grades])
    } else {
      console.log('no items:', JSON.stringify(res?.data))
    }
  } catch (e: any) {
    console.error('error:', e?.message)
  }
}
main()
