import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyFavoritesForUser } from '@/collectors/auction.collector'

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/notify] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Calculate current KST time (UTC+9)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const hour = kstNow.getUTCHours()        // 0-23
  const minute = kstNow.getUTCMinutes()    // 0-59 (raw floor)
  const dayOfWeek = kstNow.getUTCDay()     // 0=Sun ~ 6=Sat

  // Find all users with webhook + schedule configured
  const users = await prisma.user.findMany({
    where: {
      discordNotifyHour: { not: null },
      discordNotifyMinute: { not: null },
      OR: [
        { discordWebhookUrl: { not: null } },
        { discordUserId: { not: null } },
        { pushSubscriptions: { some: {} } },
      ],
    },
    select: {
      id: true,
      discordNotifyHour: true,
      discordNotifyMinute: true,
      discordNotifyDays: true,
    },
  })

  // Filter by current hour/minute (strict equality) and day of week
  const targets = users.filter((u: typeof users[number]) => {
    if (u.discordNotifyHour !== hour || u.discordNotifyMinute !== minute) return false
    if (u.discordNotifyDays === null) return true  // every day
    return u.discordNotifyDays.split(',').includes(dayOfWeek.toString())
  })

  if (targets.length === 0) {
    return NextResponse.json({ notified: 0 })
  }

  console.log(`[cron/notify] KST ${hour}:${String(minute).padStart(2, '0')} day=${dayOfWeek} — ${targets.length} users to notify`)

  let notified = 0
  for (const user of targets) {
    try {
      await notifyFavoritesForUser(user.id)
      notified++
      console.log(`[cron/notify] Notified user ${user.id}`)
    } catch (error) {
      console.error(`[cron/notify] Failed to notify user ${user.id}:`, error)
    }
  }

  return NextResponse.json({ notified })
}
