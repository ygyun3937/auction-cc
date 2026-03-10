import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json([], { status: 200 })

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(favorites.map(f => f.productCode))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productCode } = await req.json()
  if (!productCode) return NextResponse.json({ error: 'productCode required' }, { status: 400 })

  await prisma.favorite.upsert({
    where: { userId_productCode: { userId: session.user.id, productCode } },
    create: { userId: session.user.id, productCode },
    update: {},
  })
  return NextResponse.json({ ok: true })
}
