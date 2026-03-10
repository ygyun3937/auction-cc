import { prisma } from '../src/lib/db'

async function main() {
  const empty = await prisma.product.findMany({
    where: { OR: [{ name: '' }, { name: '-' }] },
    include: { category: true },
  })
  console.log(`Empty/dash name products: ${empty.length}`)
  for (const p of empty) {
    console.log(`  code=${p.code} name="${p.name}" unit=${p.unit} category=${p.category.name}`)
  }
  await prisma.$disconnect()
}
main()
