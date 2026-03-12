import { notifyFavoritesIfConfigured } from '../src/collectors/auction.collector'
import { prisma } from '../src/lib/db'

const targetDate = process.argv[2] // optional: YYYY-MM-DD

async function main() {
  await notifyFavoritesIfConfigured(targetDate)
  console.log('[notify-favorites] Done')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
