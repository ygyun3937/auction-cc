import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'
import { sendTestMessage } from '@/lib/discord'
import { sendPushNotification } from '@/lib/webpush'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      discordWebhookUrl: true,
      pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
    },
  })

  const hasDiscord = !!user?.discordWebhookUrl
  const hasPush = !!user?.pushSubscriptions?.length

  if (!hasDiscord && !hasPush) {
    return NextResponse.json({ error: 'No notification channel configured' }, { status: 400 })
  }

  let discordOk = false
  let pushOk = false

  if (hasDiscord) {
    try {
      await sendTestMessage(user!.discordWebhookUrl!)
      discordOk = true
    } catch {
      // continue to push
    }
  }

  if (hasPush) {
    const payload = { title: '테스트 알림', body: '경매 모니터에서 보낸 테스트 알림입니다.' }
    for (const sub of user!.pushSubscriptions) {
      try {
        await sendPushNotification(sub, payload)
        pushOk = true
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {})
        }
      }
    }
  }

  if (!discordOk && !pushOk) {
    return NextResponse.json({ error: '모든 채널 전송 실패' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, discord: discordOk, push: pushOk })
}
