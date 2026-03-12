import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'
import { sendTestMessage } from '@/lib/discord'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordWebhookUrl: true },
  })

  if (!user?.discordWebhookUrl) {
    return NextResponse.json({ error: 'No webhook URL configured' }, { status: 400 })
  }

  try {
    await sendTestMessage(user.discordWebhookUrl)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Discord webhook request failed' }, { status: 502 })
  }
}
