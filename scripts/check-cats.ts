import { prisma } from '../src/lib/db'

async function main() {
  const cats = await prisma.productCategory.findMany({
    include: { products: { select: { name: true } } },
    orderBy: { code: 'asc' },
  })
  for (const c of cats) {
    console.log(`[${c.code}] ${c.name}: ${c.products.map(p => p.name).join(', ')}`)
  }
  await prisma.$disconnect()
}
main()
