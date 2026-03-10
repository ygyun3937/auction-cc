import { collectAuctionData } from '../src/collectors/auction.collector'

async function main() {
  const days = 30
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().split('T')[0]
    process.stdout.write(`[${days - i}/${days}] ${date} ... `)
    const result = await collectAuctionData(date)
    if (result.success) {
      console.log(`✓ ${result.recordCount} records (${result.durationMs}ms)`)
    } else {
      console.log(`✗ ${result.errorMsg}`)
    }
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
