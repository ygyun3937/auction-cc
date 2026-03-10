import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

export async function DELETE(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  await prisma.favorite.deleteMany({
    where: { userId: session.user.id, productCode: code },
  })
  return NextResponse.json({ ok: true })
}
