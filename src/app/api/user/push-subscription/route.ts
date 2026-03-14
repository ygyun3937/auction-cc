import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

// GET: 현재 사용자의 모든 구독 endpoint 목록 반환
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    select: { endpoint: true },
  })

  return NextResponse.json({ endpoints: subs.map(s => s.endpoint) })
}

// POST: 새 구독 등록 (같은 userId+endpoint면 upsert, 다른 userId면 409)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { endpoint, keys } = body ?? {}
  const p256dh = keys?.p256dh
  const authKey = keys?.auth

  // Validate all fields are non-empty strings
  if (
    typeof endpoint !== 'string' || !endpoint.trim() ||
    typeof p256dh !== 'string' || !p256dh.trim() ||
    typeof authKey !== 'string' || !authKey.trim()
  ) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Validate endpoint is a valid HTTPS URL
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Check if endpoint already belongs to a different user
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  })
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Endpoint already registered' }, { status: 409 })
  }

  // Upsert: same user → update keys; new → create
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth: authKey },
    create: { userId: session.user.id, endpoint, p256dh, auth: authKey },
  })

  return NextResponse.json({ ok: true })
}

// DELETE: 구독 해제
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { endpoint } = body ?? {}

  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  })

  // Endpoint belongs to another user → 403
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Not found → noop 200
  if (!existing) {
    return NextResponse.json({ ok: true })
  }

  await prisma.pushSubscription.delete({ where: { endpoint } })
  return NextResponse.json({ ok: true })
}
