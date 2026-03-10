import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Categories
  const categories = [
    { code: '100', name: '채소' },
    { code: '200', name: '과일' },
    { code: '300', name: '곡류' },
    { code: '400', name: '서류' },
    { code: '500', name: '특용작물' },
  ]
  for (const cat of categories) {
    await prisma.productCategory.upsert({
      where: { code: cat.code },
      update: cat,
      create: cat,
    })
  }

  // Products (top 20 items)
  const products = [
    { code: '0101', name: '배추', unit: '10kg', categoryCode: '100' },
    { code: '0102', name: '무', unit: '20kg', categoryCode: '100' },
    { code: '0103', name: '대파', unit: '1kg', categoryCode: '100' },
    { code: '0104', name: '양파', unit: '20kg', categoryCode: '100' },
    { code: '0105', name: '시금치', unit: '4kg', categoryCode: '100' },
    { code: '0106', name: '상추', unit: '4kg', categoryCode: '100' },
    { code: '0107', name: '오이', unit: '10kg', categoryCode: '100' },
    { code: '0108', name: '호박', unit: '8kg', categoryCode: '100' },
    { code: '0109', name: '고추', unit: '10kg', categoryCode: '100' },
    { code: '0110', name: '마늘', unit: '10kg', categoryCode: '100' },
    { code: '0201', name: '사과', unit: '10kg', categoryCode: '200' },
    { code: '0202', name: '배', unit: '15kg', categoryCode: '200' },
    { code: '0203', name: '감귤', unit: '10kg', categoryCode: '200' },
    { code: '0204', name: '수박', unit: '1개', categoryCode: '200' },
    { code: '0205', name: '참외', unit: '10kg', categoryCode: '200' },
    { code: '0206', name: '포도', unit: '5kg', categoryCode: '200' },
    { code: '0301', name: '쌀', unit: '20kg', categoryCode: '300' },
    { code: '0302', name: '보리', unit: '20kg', categoryCode: '300' },
    { code: '0401', name: '감자', unit: '20kg', categoryCode: '400' },
    { code: '0402', name: '고구마', unit: '10kg', categoryCode: '400' },
  ]

  for (const p of products) {
    const category = await prisma.productCategory.findUnique({ where: { code: p.categoryCode } })
    if (!category) continue
    await prisma.product.upsert({
      where: { code: p.code },
      update: { name: p.name, unit: p.unit },
      create: { code: p.code, name: p.name, unit: p.unit, categoryId: category.id },
    })
  }

  // Markets (17 major wholesale markets)
  const markets = [
    { code: '110001', name: '서울가락시장', region: '서울', address: '서울 송파구 가락로 32' },
    { code: '110002', name: '서울강서시장', region: '서울', address: '서울 강서구 공항대로 48길 90' },
    { code: '210001', name: '부산엄궁시장', region: '부산', address: '부산 사상구 엄궁동' },
    { code: '210002', name: '부산반여시장', region: '부산', address: '부산 해운대구 반여동' },
    { code: '220001', name: '인천구월시장', region: '인천', address: '인천 남동구 구월동' },
    { code: '230001', name: '대구북부시장', region: '대구', address: '대구 북구 매천동' },
    { code: '240001', name: '광주각화시장', region: '광주', address: '광주 북구 각화동' },
    { code: '250001', name: '대전오정시장', region: '대전', address: '대전 대덕구 오정동' },
    { code: '260001', name: '울산시장', region: '울산', address: '울산 북구 명촌동' },
    { code: '310001', name: '수원시장', region: '경기', address: '경기 수원시 권선구' },
    { code: '310002', name: '안양시장', region: '경기', address: '경기 안양시 만안구' },
    { code: '310003', name: '구리시장', region: '경기', address: '경기 구리시 토평동' },
    { code: '350001', name: '전주시장', region: '전북', address: '전북 전주시 덕진구' },
    { code: '360001', name: '광양시장', region: '전남', address: '전남 광양시' },
    { code: '370001', name: '포항시장', region: '경북', address: '경북 포항시 북구' },
    { code: '380001', name: '창원시장', region: '경남', address: '경남 창원시 의창구' },
    { code: '390001', name: '제주시장', region: '제주', address: '제주 제주시 오등동' },
  ]

  for (const m of markets) {
    await prisma.market.upsert({
      where: { code: m.code },
      update: { name: m.name, region: m.region, address: m.address },
      create: m,
    })
  }

  console.log('Seed complete!')
  console.log(`  - ${categories.length} categories`)
  console.log(`  - ${products.length} products`)
  console.log(`  - ${markets.length} markets`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
