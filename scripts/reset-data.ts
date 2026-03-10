import { prisma } from '../src/lib/db'

async function main() {
  console.log('Resetting all price/product data...')
  await prisma.dailyPrice.deleteMany({})
  await prisma.auctionPrice.deleteMany({})
  await prisma.product.deleteMany({})
  await prisma.productCategory.deleteMany({})
  await prisma.collectionLog.deleteMany({})
  console.log('Done. Ready for fresh backfill.')
  await prisma.$disconnect()
}
main()
