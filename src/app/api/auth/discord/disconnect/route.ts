// src/app/api/auth/discord/disconnect/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordWebhookUrl: true },
  })

  // If no webhook is configured, also clear schedule to avoid notification blackout
  const clearSchedule = !user?.discordWebhookUrl

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      discordUserId: null,
      discordUsername: null,
      ...(clearSchedule && {
        discordNotifyHour: null,
        discordNotifyMinute: null,
        discordNotifyDays: null,
      }),
    },
  })

  return NextResponse.json({ ok: true, clearedSchedule: clearSchedule })
}
