import { prisma } from '../src/lib/db'

async function main() {
  // Check auction prices
  const apCount = await prisma.auctionPrice.count()
  const dates = await prisma.auctionPrice.findMany({
    select: { auctionDate: true },
    distinct: ['auctionDate'],
    orderBy: { auctionDate: 'asc' },
  })
  console.log(`auctionPrice: ${apCount} records across ${dates.length} dates`)

  if (apCount === 0) {
    console.log('No auction data — run backfill first')
    await prisma.$disconnect()
    return
  }

  const MIN_VOLUME = 10
  function removeOutliers(prices: number[]) {
    if (prices.length < 4) return prices
    const sorted = [...prices].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(sorted.length * 0.25)]
    const q3 = sorted[Math.floor(sorted.length * 0.75)]
    const iqr = q3 - q1
    if (iqr === 0) return prices
    const lower = q1 - 1.5 * iqr
    const upper = q3 + 1.5 * iqr
    const result = sorted.filter(p => p >= lower && p <= upper)
    return result.length > 0 ? result : prices
  }

  for (const { auctionDate } of dates) {
    const products = await prisma.product.findMany()
    let dayCount = 0
    for (const product of products) {
      const prices = await prisma.auctionPrice.findMany({ where: { productId: product.id, auctionDate } })
      if (prices.length === 0) continue

      const volFiltered = prices.filter(p => Number(p.volume) >= MIN_VOLUME)
      const pricesForStats = volFiltered.length > 0 ? volFiltered : prices
      const marketAvgs = pricesForStats.map(p => Number(p.avgPrice))
      const filteredAvgs = removeOutliers(marketAvgs)
      const excludedMarkets = prices.length - filteredAvgs.length
      const includedPrices = pricesForStats.filter(p => filteredAvgs.includes(Number(p.avgPrice)))

      const avgPrice = filteredAvgs.reduce((s, v) => s + v, 0) / filteredAvgs.length
      const minPrice = Math.min(...includedPrices.map(p => Number(p.minPrice)))
      const maxPrice = Math.max(...includedPrices.map(p => Number(p.maxPrice)))
      const totalVolume = prices.reduce((sum, p) => sum + Number(p.volume), 0)

      const prevDate = new Date(auctionDate)
      prevDate.setDate(prevDate.getDate() - 1)
      const prevDaily = await prisma.dailyPrice.findUnique({
        where: { uq_daily_price: { productId: product.id, priceDate: prevDate } },
      })
      const changeRate = prevDaily
        ? ((avgPrice - Number(prevDaily.avgPrice)) / Number(prevDaily.avgPrice)) * 100
        : null

      await prisma.dailyPrice.upsert({
        where: { uq_daily_price: { productId: product.id, priceDate: auctionDate } },
        update: { avgPrice, minPrice, maxPrice, totalVolume, changeRate, excludedMarkets },
        create: { productId: product.id, priceDate: auctionDate, avgPrice, minPrice, maxPrice, totalVolume, changeRate, excludedMarkets },
      })
      dayCount++
    }
    process.stdout.write(`${auctionDate.toISOString().split('T')[0]}: ${dayCount} products\n`)
  }

  const finalCount = await prisma.dailyPrice.count()
  console.log(`\nTotal dailyPrice records: ${finalCount}`)
  await prisma.$disconnect()
}
main()
