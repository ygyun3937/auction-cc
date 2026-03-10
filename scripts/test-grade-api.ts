import ky from 'ky'
const API_KEY = process.env.PUBLIC_DATA_API_KEY!

async function tryUrl(label: string, url: string) {
  try {
    const res = await ky.get(url, { timeout: 10000 }).text()
    if (res.includes('Forbidden') || res.includes('not found') || res.startsWith('<')) {
      console.log(`✗ ${label}: ${res.slice(0, 80)}`)
      return
    }
    const data = JSON.parse(res)
    const items = data?.response?.body?.items?.item
    if (items?.length > 0) {
      console.log(`✓ ${label}`)
      console.log('  fields:', Object.keys(items[0]).join(', '))
      if ('grd_cd' in items[0]) console.log('  ✅ grd_cd:', items[0].grd_cd, '| grd_nm:', items[0].grd_nm)
    } else {
      console.log(`△ ${label}: ${JSON.stringify(data?.response?.header)}`)
    }
  } catch (e) {
    console.log(`✗ ${label}: error - ${e}`)
  }
}

async function main() {
  const date = '2026-03-09'
  const key = API_KEY

  // Try different base paths
  const bases = ['katOrigin', 'katRealTime', 'katRealTime2']
  const ops = ['trades', 'trades2', 'auctnOrign', 'auctnList', 'auctnInfo']

  for (const base of bases) {
    for (const op of ops) {
      const url = `https://apis.data.go.kr/B552845/${base}/${op}?serviceKey=${key}&cond[trd_clcln_ymd::EQ]=${date}&pageNo=1&numOfRows=3&returnType=json`
      await tryUrl(`${base}/${op}`, url)
    }
  }
}
main()
