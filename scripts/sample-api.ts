import { fetchAuctionData } from '../src/lib/api-client'

async function main() {
  const items = await fetchAuctionData({ saleDate: '2026-03-09', pageNo: 1, numOfRows: 1000 })
  // Show unique product + sclsf (variety/grade) combos
  const seen = new Set<string>()
  for (const item of items) {
    const key = `${item.gds_mclsf_nm} | sclsf: [${item.gds_sclsf_cd}] ${item.gds_sclsf_nm}`
    if (!seen.has(key)) {
      seen.add(key)
      console.log(key)
    }
  }
}
main()
