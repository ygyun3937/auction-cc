import ky from 'ky'
const KEY = process.env.PUBLIC_DATA_API_KEY!

async function tryUrl(label: string, url: string) {
  try {
    const res = await ky.get(url, { timeout: 15000 }).text()
    if (res.startsWith('<')) {
      console.log(`✗ ${label}: HTML/XML response`)
      return
    }
    const data = JSON.parse(res)
    const header = data?.response?.header
    const items = data?.response?.body?.items?.item
    if (items?.length > 0) {
      console.log(`✓ ${label}`)
      console.log('  fields:', Object.keys(items[0]).join(', '))
      if ('grd_cd' in items[0]) console.log('  ✅ grd_cd:', items[0].grd_cd, '| grd_nm:', items[0].grd_nm)
    } else {
      console.log(`△ ${label}: resultCode=${header?.resultCode} msg=${header?.resultMsg} totalCount=${data?.response?.body?.totalCount}`)
    }
  } catch (e: any) {
    console.log(`✗ ${label}: ${e?.message?.slice(0, 100)}`)
  }
}

async function main() {
  const key = KEY
  const base = 'https://apis.data.go.kr/B552845/katOrigin'

  // Try different dates
  const dates = ['2026-03-09', '2026-03-07', '2026-03-06', '2026-03-05']
  const ops = ['trades', 'auctnInfo', 'auctnOrign', 'auctnRslt', 'auctnDtl', 'selrInfo', 'mktInfo']

  // First try all ops with most recent date
  console.log('=== Testing operations with date 2026-03-09 ===')
  for (const op of ops) {
    const url = `${base}/${op}?serviceKey=${key}&cond[trd_clcln_ymd::EQ]=2026-03-09&pageNo=1&numOfRows=3&returnType=json`
    await tryUrl(`katOrigin/${op}`, url)
  }

  // Try different dates for 'trades'
  console.log('\n=== Testing katOrigin/trades with different dates ===')
  for (const date of dates) {
    const url = `${base}/trades?serviceKey=${key}&cond[trd_clcln_ymd::EQ]=${date}&pageNo=1&numOfRows=3&returnType=json`
    await tryUrl(`trades/${date}`, url)
  }

  // Try without date filter
  console.log('\n=== Testing katOrigin/trades without date filter ===')
  await tryUrl('trades (no date)', `${base}/trades?serviceKey=${key}&pageNo=1&numOfRows=3&returnType=json`)

  // Try different query param format
  console.log('\n=== Testing katOrigin/trades with different param formats ===')
  await tryUrl('trades (trd_clcln_ymd param)', `${base}/trades?serviceKey=${key}&trd_clcln_ymd=2026-03-09&pageNo=1&numOfRows=3&returnType=json`)
  await tryUrl('trades (whsl_mrkt_cd=110000)', `${base}/trades?serviceKey=${key}&cond[trd_clcln_ymd::EQ]=2026-03-09&cond[whsl_mrkt_cd::EQ]=110000&pageNo=1&numOfRows=3&returnType=json`)
}
main()
