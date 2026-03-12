import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

const WEBHOOK_URL_REGEX = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w.\-]+$/

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordWebhookUrl: true, discordLastNotifiedAt: true },
  })

  return NextResponse.json({
    webhookUrl: user?.discordWebhookUrl ?? null,
    lastNotifiedAt: user?.discordLastNotifiedAt?.toISOString() ?? null,
  })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { webhookUrl } = await req.json()

  // null or empty string → clear
  if (!webhookUrl) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { discordWebhookUrl: null },
    })
    return NextResponse.json({ ok: true })
  }

  if (!WEBHOOK_URL_REGEX.test(webhookUrl)) {
    return NextResponse.json({ error: 'Invalid webhook URL format' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { discordWebhookUrl: webhookUrl },
  })
  return NextResponse.json({ ok: true })
}
