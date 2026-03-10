import { prisma } from '../src/lib/db'

async function main() {
  const count = await prisma.dailyPrice.count()
  const latest = await prisma.dailyPrice.findFirst({ orderBy: { priceDate: 'desc' }, select: { priceDate: true, avgPrice: true } })
  const productCount = await prisma.product.count()
  console.log(`dailyPrice records: ${count}`)
  console.log(`latest: ${JSON.stringify(latest)}`)
  console.log(`products: ${productCount}`)
  await prisma.$disconnect()
}
main()
