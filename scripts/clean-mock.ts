import { prisma } from '../src/lib/db'

async function main() {
  // Mock data used codes like 100, 200, 300, 400, 500
  const mockCodes = ['100', '200', '300', '400', '500']
  const mockCats = await prisma.productCategory.findMany({ where: { code: { in: mockCodes } } })
  const catIds = mockCats.map(c => c.id)
  console.log(`Mock categories: ${catIds.length}`)

  if (catIds.length > 0) {
    const prods = await prisma.product.findMany({ where: { categoryId: { in: catIds } } })
    const prodIds = prods.map(p => p.id)
    if (prodIds.length > 0) {
      const d1 = await prisma.auctionPrice.deleteMany({ where: { productId: { in: prodIds } } })
      const d2 = await prisma.dailyPrice.deleteMany({ where: { productId: { in: prodIds } } })
      const d3 = await prisma.product.deleteMany({ where: { id: { in: prodIds } } })
      console.log(`Deleted: ${d1.count} auctionPrices, ${d2.count} dailyPrices, ${d3.count} products`)
    }
    const d4 = await prisma.productCategory.deleteMany({ where: { id: { in: catIds } } })
    console.log(`Deleted: ${d4.count} mock categories`)
  }

  // Also clean empty categories (no products)
  const emptyCats = await prisma.productCategory.findMany({
    where: { products: { none: {} } },
  })
  if (emptyCats.length > 0) {
    const d5 = await prisma.productCategory.deleteMany({ where: { id: { in: emptyCats.map(c => c.id) } } })
    console.log(`Deleted: ${d5.count} empty categories`)
  }

  await prisma.$disconnect()
}
main()
