// src/app/api/auth/discord/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/db'

function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    // format: "userId:nonce:sig" — userId is cuid (no colons), nonce is UUID (no colons)
    const lastColon = decoded.lastIndexOf(':')
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1)
    if (lastColon === -1 || secondLastColon === -1) return null

    const sig = decoded.slice(lastColon + 1)
    const payload = decoded.slice(0, lastColon)
    const userId = decoded.slice(0, secondLastColon)

    const expected = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(payload)
      .digest('hex')

    if (sig !== expected) return null
    return userId
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const favoritesUrl = `${process.env.AUTH_URL}/favorites`

  if (!code || !state) {
    return NextResponse.redirect(`${favoritesUrl}?error=discord_auth_failed`)
  }

  const userId = verifyState(state)
  if (!userId) {
    return NextResponse.redirect(`${favoritesUrl}?error=discord_auth_failed`)
  }

  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const authUrl = process.env.AUTH_URL
  if (!clientId || !clientSecret || !authUrl) {
    return NextResponse.redirect(`${favoritesUrl}?error=discord_auth_failed`)
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${authUrl}/api/auth/discord/callback`,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[discord/callback] Token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${favoritesUrl}?error=discord_auth_failed`)
  }

  const { access_token } = await tokenRes.json() as { access_token: string }

  // Get Discord user info (used once, discarded)
  const userRes = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` },
  })

  if (!userRes.ok) {
    return NextResponse.redirect(`${favoritesUrl}?error=discord_auth_failed`)
  }

  const discordUser = await userRes.json() as { id: string; username: string; discriminator?: string }
  const discordUserId = discordUser.id
  // "0" discriminator means new username system (no #tag)
  const discordUsername = discordUser.discriminator && discordUser.discriminator !== '0'
    ? `${discordUser.username}#${discordUser.discriminator}`
    : discordUser.username

  // Check if another user already owns this Discord account
  const existing = await prisma.user.findUnique({
    where: { discordUserId },
    select: { id: true },
  })
  if (existing && existing.id !== userId) {
    return NextResponse.redirect(`${favoritesUrl}?error=discord_already_linked`)
  }

  // Save (upsert same user)
  await prisma.user.update({
    where: { id: userId },
    data: { discordUserId, discordUsername },
  })

  return NextResponse.redirect(favoritesUrl)
}
