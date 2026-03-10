/**
 * Backfill variety daily prices from existing auction price raw data
 * Re-collects from API for past 30 days to populate variety_daily_prices table
 */
import { collectAuctionData } from '../src/collectors/auction.collector'
import { prisma } from '../src/lib/db'

async function main() {
  // Find all dates we have daily prices for
  const dates = await prisma.dailyPrice.findMany({
    select: { priceDate: true },
    distinct: ['priceDate'],
    orderBy: { priceDate: 'desc' },
    take: 30,
  })

  console.log(`Found ${dates.length} dates to backfill variety prices`)

  for (const { priceDate } of dates) {
    const dateStr = priceDate.toISOString().split('T')[0]
    console.log(`\nProcessing ${dateStr}...`)

    // Check if variety prices already exist for this date
    const existing = await prisma.varietyDailyPrice.count({
      where: { priceDate },
    })
    if (existing > 0) {
      console.log(`  ✓ Already has ${existing} variety price records, skipping`)
      continue
    }

    const result = await collectAuctionData(dateStr)
    console.log(`  ${result.success ? '✓' : '✗'} ${result.recordCount} records, ${result.durationMs}ms${result.errorMsg ? ` - ${result.errorMsg}` : ''}`)
  }

  console.log('\nDone!')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
