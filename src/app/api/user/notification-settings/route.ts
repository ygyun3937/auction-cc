import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

const WEBHOOK_URL_REGEX = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w.\-]+$/

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      discordWebhookUrl: true,
      discordLastNotifiedAt: true,
      discordNotifyHour: true,
      discordNotifyMinute: true,
      discordNotifyDays: true,
      discordUserId: true,
      discordUsername: true,
    },
  })

  return NextResponse.json({
    webhookUrl: user?.discordWebhookUrl ?? null,
    discordUserId: user?.discordUserId ?? null,
    discordUsername: user?.discordUsername ?? null,
    lastNotifiedAt: user?.discordLastNotifiedAt?.toISOString() ?? null,
    notifyHour: user?.discordNotifyHour ?? null,
    notifyMinute: user?.discordNotifyMinute ?? null,
    notifyDays: user?.discordNotifyDays ?? null,
  })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { webhookUrl, notifyHour, notifyMinute, notifyDays } = body

  // 1. webhookUrl null/empty → cascade clear schedule only if DM also not configured
  if (!webhookUrl) {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordUserId: true },
    })
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        discordWebhookUrl: null,
        // Only clear schedule if DM is also not configured
        ...(current?.discordUserId == null && {
          discordNotifyHour: null,
          discordNotifyMinute: null,
          discordNotifyDays: null,
        }),
      },
    })
    return NextResponse.json({ ok: true })
  }

  // 2. Validate webhookUrl
  if (!WEBHOOK_URL_REGEX.test(webhookUrl)) {
    return NextResponse.json({ error: 'Invalid webhook URL format' }, { status: 400 })
  }

  // 3. Validate notifyHour: null or integer 0-23
  if (notifyHour !== null && notifyHour !== undefined) {
    if (typeof notifyHour !== 'number' || !Number.isInteger(notifyHour) || notifyHour < 0 || notifyHour > 23) {
      return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
    }
  }

  // 4. Validate notifyMinute: null or 0 or 30
  if (notifyMinute !== null && notifyMinute !== undefined) {
    if (notifyMinute !== 0 && notifyMinute !== 30) {
      return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
    }
  }

  // 5. notifyHour and notifyMinute must both be null or both be set
  const hourSet = notifyHour !== null && notifyHour !== undefined
  const minuteSet = notifyMinute !== null && notifyMinute !== undefined
  if (hourSet !== minuteSet) {
    return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
  }

  // 6. Validate notifyDays: null, empty string → null; otherwise validate format
  let normalizedDays: string | null = null
  const rawDays = notifyDays === '' ? null : (notifyDays ?? null)
  if (rawDays !== null) {
    const parts = rawDays.split(',')
    const nums: number[] = []
    for (const part of parts) {
      if (!/^[0-6]$/.test(part)) {
        return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
      }
      const n = parseInt(part, 10)
      if (nums.includes(n)) {
        return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
      }
      nums.push(n)
    }
    normalizedDays = nums.sort((a, b) => a - b).join(',')
  }

  // If no time is configured, days are meaningless — clear them too
  if (!hourSet) normalizedDays = null

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      discordWebhookUrl: webhookUrl,
      discordNotifyHour: hourSet ? notifyHour : null,
      discordNotifyMinute: minuteSet ? notifyMinute : null,
      discordNotifyDays: normalizedDays,
    },
  })
  return NextResponse.json({ ok: true })
}
