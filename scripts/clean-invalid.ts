import { prisma } from '../src/lib/db'

async function main() {
  // Find invalid categories
  const invalidCats = await prisma.productCategory.findMany({ where: { name: '-' } })
  const catIds = invalidCats.map(c => c.id)
  console.log(`Invalid categories: ${catIds.length}`)

  if (catIds.length > 0) {
    // Find all products in invalid categories
    const prods = await prisma.product.findMany({ where: { categoryId: { in: catIds } } })
    const prodIds = prods.map(p => p.id)
    console.log(`Products in invalid categories: ${prodIds.length}`)

    if (prodIds.length > 0) {
      const d1 = await prisma.auctionPrice.deleteMany({ where: { productId: { in: prodIds } } })
      const d2 = await prisma.dailyPrice.deleteMany({ where: { productId: { in: prodIds } } })
      const d3 = await prisma.product.deleteMany({ where: { id: { in: prodIds } } })
      console.log(`Deleted: ${d1.count} auctionPrices, ${d2.count} dailyPrices, ${d3.count} products`)
    }

    const d4 = await prisma.productCategory.deleteMany({ where: { id: { in: catIds } } })
    console.log(`Deleted: ${d4.count} invalid categories`)
  }

  await prisma.$disconnect()
}
main()
