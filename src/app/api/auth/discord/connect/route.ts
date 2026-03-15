// src/app/api/auth/discord/connect/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { createHmac, randomUUID } from 'crypto'

function createState(userId: string): string {
  const nonce = randomUUID()
  const payload = `${userId}:${nonce}`
  const sig = createHmac('sha256', process.env.AUTH_SECRET!)
    .update(payload)
    .digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', process.env.AUTH_URL!))
  }

  const clientId = process.env.DISCORD_CLIENT_ID
  const authUrl = process.env.AUTH_URL
  if (!clientId || !authUrl) {
    return NextResponse.json({ error: 'Discord OAuth not configured' }, { status: 500 })
  }

  const state = createState(session.user.id)
  const redirectUri = `${authUrl}/api/auth/discord/callback`

  const discordUrl = new URL('https://discord.com/oauth2/authorize')
  discordUrl.searchParams.set('client_id', clientId)
  discordUrl.searchParams.set('redirect_uri', redirectUri)
  discordUrl.searchParams.set('response_type', 'code')
  discordUrl.searchParams.set('scope', 'identify')
  discordUrl.searchParams.set('state', state)

  return NextResponse.redirect(discordUrl.toString())
}
