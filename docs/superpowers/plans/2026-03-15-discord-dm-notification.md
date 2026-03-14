# Discord DM Notification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Discord DM as primary notification channel (OAuth connect → Bot DM), keeping existing webhook as fallback.

**Architecture:** User clicks "Discord 연결하기" → server generates HMAC state → Discord OAuth (scope: identify) → callback stores discordUserId → bot sends DMs. Webhook stays as fallback if DM fails.

**Tech Stack:** Next.js 14 App Router, Prisma (PostgreSQL), Auth.js v5 (JWT session), Node.js `crypto` (HMAC state), Discord API v10

---

## Chunk 1: Database + Discord DM functions

### Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma` (User model, lines 158-178)

- [ ] **Step 1: Add new fields to User model in schema.prisma**

  Open `prisma/schema.prisma`. After line 170 (`discordNotifyDays String?`), add:

  ```prisma
  discordUserId         String?   @unique
  discordUsername       String?
  ```

  The User model block should now look like:
  ```prisma
  model User {
    id            String    @id @default(cuid())
    name          String?
    email         String    @unique
    emailVerified DateTime?
    image         String?
    createdAt     DateTime  @default(now())

    discordWebhookUrl     String?
    discordLastNotifiedAt DateTime?
    discordNotifyHour     Int?
    discordNotifyMinute   Int?
    discordNotifyDays     String?
    discordUserId         String?   @unique
    discordUsername       String?

    accounts          Account[]
    sessions          Session[]
    favorites         Favorite[]
    pushSubscriptions PushSubscription[]

    @@map("users")
  }
  ```

- [ ] **Step 2: Run migration**

  ```bash
  cd /Users/yg/project/cc-project/dd-project/auction-monitor
  npx prisma migrate dev --name add_discord_dm_fields
  ```

  Expected: migration file created in `prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 3: Verify TypeScript picks up new fields**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors related to discordUserId/discordUsername.

- [ ] **Step 4: Commit**

  ```bash
  git add prisma/schema.prisma prisma/migrations/
  git commit -m "feat: add discordUserId and discordUsername fields to User"
  ```

---

### Task 2: Discord lib — sendDMToUser and sendTestDM

**Files:**
- Modify: `src/lib/discord.ts`

- [ ] **Step 1: Read the current file**

  Read `src/lib/discord.ts` to understand the existing `DiscordEmbed` interface, `priceColor`, `formatChange`, and `notifyFavoritesPrices` functions. You will reuse these.

- [ ] **Step 2: Add DM functions to the bottom of discord.ts**

  Append to `src/lib/discord.ts`:

  ```ts
  // ─── Bot DM sending ───────────────────────────────────────────────────────

  function getBotToken(): string {
    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) throw new Error('DISCORD_BOT_TOKEN is not set')
    return token
  }

  async function sendDM(discordUserId: string, embeds: DiscordEmbed[]): Promise<void> {
    const token = getBotToken()

    // 1. Open/get DM channel
    const chanRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://github.com, 1.0)',
      },
      body: JSON.stringify({ recipient_id: discordUserId }),
    })
    if (!chanRes.ok) {
      const text = await chanRes.text()
      throw new Error(`DM channel open failed: ${chanRes.status} ${text}`)
    }
    const { id: channelId } = await chanRes.json() as { id: string }

    // 2. Send message (NO username field — bot name set in Discord Developer Portal)
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://github.com, 1.0)',
      },
      body: JSON.stringify({ embeds }),
    })
    if (!msgRes.ok) {
      const text = await msgRes.text()
      throw new Error(`DM send failed: ${msgRes.status} ${text}`)
    }
  }

  export async function sendDMToUser(discordUserId: string, products: FavoriteProductPrice[]): Promise<void> {
    if (products.length === 0) return

    const chunks: FavoriteProductPrice[][] = []
    for (let i = 0; i < products.length; i += 10) {
      chunks.push(products.slice(i, i + 10))
    }

    let successCount = 0
    let lastError: Error | null = null

    for (const chunk of chunks) {
      const embeds: DiscordEmbed[] = chunk.map(p => ({
        title: `${p.productName} (${p.unit})`,
        color: priceColor(p.changeRate),
        fields: [
          { name: '평균가', value: `**${p.avgPrice.toLocaleString()}원**`, inline: true },
          { name: '등락률', value: formatChange(p.changeRate), inline: true },
          { name: '거래량', value: `${p.totalVolume.toLocaleString()} ${p.unit}`, inline: true },
          { name: '최저 / 최고', value: `${p.minPrice.toLocaleString()} ~ ${p.maxPrice.toLocaleString()}원`, inline: false },
        ],
        footer: { text: `기준일: ${p.priceDate}` },
      }))

      try {
        await sendDM(discordUserId, embeds)
        successCount++
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.error(`[discord-dm] Chunk send failed:`, err)
      }
    }

    if (successCount === 0 && lastError) {
      throw lastError
    }
  }

  export async function sendTestDM(discordUserId: string): Promise<void> {
    const embed: DiscordEmbed = {
      title: '✅ Discord DM 연결 성공!',
      description: '경매 모니터에서 즐겨찾기 알림이 DM으로 전송됩니다.',
      color: 0x2ecc71,
      fields: [],
      timestamp: new Date().toISOString(),
    }
    await sendDM(discordUserId, [embed])
  }
  ```

- [ ] **Step 3: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep discord
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/discord.ts
  git commit -m "feat: add sendDMToUser and sendTestDM bot DM functions"
  ```

---

## Chunk 2: OAuth routes

### Task 3: Discord OAuth connect route

**Files:**
- Create: `src/app/api/auth/discord/connect/route.ts`

- [ ] **Step 1: Create the file**

  ```ts
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
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep connect
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/auth/discord/connect/route.ts
  git commit -m "feat: add Discord OAuth connect route"
  ```

---

### Task 4: Discord OAuth callback route

**Files:**
- Create: `src/app/api/auth/discord/callback/route.ts`

- [ ] **Step 1: Create the file**

  ```ts
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
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep callback
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/auth/discord/callback/route.ts
  git commit -m "feat: add Discord OAuth callback route"
  ```

---

### Task 5: Discord disconnect route

**Files:**
- Create: `src/app/api/auth/discord/disconnect/route.ts`

- [ ] **Step 1: Create the file**

  ```ts
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
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep disconnect
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/auth/discord/disconnect/route.ts
  git commit -m "feat: add Discord disconnect route with schedule cascade"
  ```

---

## Chunk 3: API updates

### Task 6: Notification settings API — GET + PUT

**Files:**
- Modify: `src/app/api/user/notification-settings/route.ts`

- [ ] **Step 1: Read the current file**

  Read `src/app/api/user/notification-settings/route.ts` in full.

- [ ] **Step 2: Update GET — add discordUserId/discordUsername to select and response**

  Replace the `select` block in the GET handler:
  ```ts
  // Before:
  select: {
    discordWebhookUrl: true,
    discordLastNotifiedAt: true,
    discordNotifyHour: true,
    discordNotifyMinute: true,
    discordNotifyDays: true,
  },

  // After:
  select: {
    discordWebhookUrl: true,
    discordLastNotifiedAt: true,
    discordNotifyHour: true,
    discordNotifyMinute: true,
    discordNotifyDays: true,
    discordUserId: true,
    discordUsername: true,
  },
  ```

  Replace the `return NextResponse.json(...)` in GET:
  ```ts
  // Before:
  return NextResponse.json({
    webhookUrl: user?.discordWebhookUrl ?? null,
    lastNotifiedAt: user?.discordLastNotifiedAt?.toISOString() ?? null,
    notifyHour: user?.discordNotifyHour ?? null,
    notifyMinute: user?.discordNotifyMinute ?? null,
    notifyDays: user?.discordNotifyDays ?? null,
  })

  // After:
  return NextResponse.json({
    webhookUrl: user?.discordWebhookUrl ?? null,
    discordUserId: user?.discordUserId ?? null,
    discordUsername: user?.discordUsername ?? null,
    lastNotifiedAt: user?.discordLastNotifiedAt?.toISOString() ?? null,
    notifyHour: user?.discordNotifyHour ?? null,
    notifyMinute: user?.discordNotifyMinute ?? null,
    notifyDays: user?.discordNotifyDays ?? null,
  })
  ```

- [ ] **Step 3: Update PUT — cascade schedule only when BOTH webhook cleared AND discordUserId is null**

  In the PUT handler, the block that handles `!webhookUrl` (lines ~39-49) currently clears schedule fields. Update it to first check discordUserId:

  ```ts
  // Replace the current "!webhookUrl" block:
  if (!webhookUrl) {
    // Fetch current discordUserId to decide whether to cascade schedule
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
  ```

- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep notification-settings
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/api/user/notification-settings/route.ts
  git commit -m "feat: expose discordUserId in notification settings API, fix cascade logic"
  ```

---

### Task 7: Test notification route — DM first, webhook fallback

**Files:**
- Modify: `src/app/api/user/notification-settings/test/route.ts`

- [ ] **Step 1: Read the current file**

  Read `src/app/api/user/notification-settings/test/route.ts` in full.

- [ ] **Step 2: Update imports and user select**

  Add `sendTestDM` to the discord import:
  ```ts
  import { sendTestMessage, sendTestDM } from '@/lib/discord'
  ```

  Update the `user` select to include `discordUserId`:
  ```ts
  select: {
    discordUserId: true,
    discordWebhookUrl: true,
    pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
  },
  ```

- [ ] **Step 3: Update the hasDiscord check and Discord sending logic**

  Replace the existing `hasDiscord` / discord sending block:
  ```ts
  // Before:
  const hasDiscord = !!user?.discordWebhookUrl
  const hasPush = !!user?.pushSubscriptions?.length

  if (!hasDiscord && !hasPush) { ... }

  let discordOk = false
  let pushOk = false

  if (hasDiscord) {
    try {
      await sendTestMessage(user!.discordWebhookUrl!)
      discordOk = true
    } catch { ... }
  }

  // After:
  const hasDiscordDM = !!user?.discordUserId
  const hasDiscordWebhook = !!user?.discordWebhookUrl
  const hasDiscord = hasDiscordDM || hasDiscordWebhook
  const hasPush = !!user?.pushSubscriptions?.length

  if (!hasDiscord && !hasPush) {
    return NextResponse.json({ error: 'No notification channel configured' }, { status: 400 })
  }

  let discordOk = false
  let pushOk = false

  // Discord: DM first, webhook fallback
  if (hasDiscordDM) {
    try {
      await sendTestDM(user!.discordUserId!)
      discordOk = true
    } catch {
      // DM failed — try webhook fallback
    }
  }
  if (!discordOk && hasDiscordWebhook) {
    try {
      await sendTestMessage(user!.discordWebhookUrl!)
      discordOk = true
    } catch {
      // continue to push
    }
  }
  ```

- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep test
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/api/user/notification-settings/test/route.ts
  git commit -m "feat: test notification tries DM first, webhook as fallback"
  ```

---

## Chunk 4: Collector + cron

### Task 8: Cron notify — add discordUserId to WHERE

**Files:**
- Modify: `src/app/api/cron/notify/route.ts`

- [ ] **Step 1: Update the WHERE clause**

  In `src/app/api/cron/notify/route.ts`, find this block (around line 28-31):
  ```ts
  OR: [
    { discordWebhookUrl: { not: null } },
    { pushSubscriptions: { some: {} } },
  ],
  ```

  Replace with:
  ```ts
  OR: [
    { discordWebhookUrl: { not: null } },
    { discordUserId: { not: null } },
    { pushSubscriptions: { some: {} } },
  ],
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep cron
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/cron/notify/route.ts
  git commit -m "feat: include discordUserId users in cron notification query"
  ```

---

### Task 9: Collector — DM-first, webhook-fallback in notifyFavoritesForUser

**Files:**
- Modify: `src/collectors/auction.collector.ts`

- [ ] **Step 1: Add sendDMToUser import**

  At the top of `src/collectors/auction.collector.ts`, find:
  ```ts
  import { notifyFavoritesPrices } from '@/lib/discord'
  ```

  Replace with:
  ```ts
  import { notifyFavoritesPrices, sendDMToUser } from '@/lib/discord'
  ```

- [ ] **Step 2: Update notifyFavoritesForUser — select clause**

  Find the `select` block inside `notifyFavoritesForUser` (around line 414-417):
  ```ts
  select: {
    discordWebhookUrl: true,
    pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
  },
  ```

  Replace with:
  ```ts
  select: {
    discordWebhookUrl: true,
    discordUserId: true,
    pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
  },
  ```

- [ ] **Step 3: Update early-return guard**

  Find (around line 421):
  ```ts
  if (!user?.discordWebhookUrl && (!user?.pushSubscriptions || user.pushSubscriptions.length === 0)) return
  ```

  Replace with:
  ```ts
  if (!user?.discordUserId && !user?.discordWebhookUrl && (!user?.pushSubscriptions || user.pushSubscriptions.length === 0)) return
  ```

- [ ] **Step 4: Replace the Discord sending block**

  Find the Discord sending block (around lines 474-482):
  ```ts
  // 6. Discord 발송 (webhook 있는 경우만)
  if (user.discordWebhookUrl) {
    try {
      await notifyFavoritesPrices(payload, user.discordWebhookUrl)
      discordSuccess = true
    } catch (err) {
      console.error(`[collector] Discord notification failed for user ${userId}:`, err)
    }
  }
  ```

  Replace with:
  ```ts
  // 6. Discord 발송 (DM 우선, webhook 폴백)
  if (user.discordUserId) {
    try {
      await sendDMToUser(user.discordUserId, payload)
      discordSuccess = true
    } catch (err) {
      console.error(`[collector] Discord DM failed for user ${userId}, trying webhook fallback:`, err)
      if (user.discordWebhookUrl) {
        try {
          await notifyFavoritesPrices(payload, user.discordWebhookUrl)
          discordSuccess = true
        } catch (webhookErr) {
          console.error(`[collector] Discord webhook fallback also failed for user ${userId}:`, webhookErr)
        }
      }
    }
  } else if (user.discordWebhookUrl) {
    try {
      await notifyFavoritesPrices(payload, user.discordWebhookUrl)
      discordSuccess = true
    } catch (err) {
      console.error(`[collector] Discord webhook failed for user ${userId}:`, err)
    }
  }
  ```

- [ ] **Step 5: Update notifyFavoritesIfConfigured WHERE clause**

  Find the `notifyFavoritesIfConfigured` function and its WHERE clause (look for `OR: [{ discordWebhookUrl`). It should currently read:
  ```ts
  OR: [
    { discordWebhookUrl: { not: null } },
    { pushSubscriptions: { some: {} } },
  ],
  ```

  Replace with:
  ```ts
  OR: [
    { discordWebhookUrl: { not: null } },
    { discordUserId: { not: null } },
    { pushSubscriptions: { some: {} } },
  ],
  ```

- [ ] **Step 6: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | grep collector
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/collectors/auction.collector.ts
  git commit -m "feat: DM-first discord notification with webhook fallback in collector"
  ```

---

## Chunk 5: UI + env

### Task 10: NotificationSettingsModal — Discord connect section

**Files:**
- Modify: `src/components/NotificationSettingsModal.tsx`

- [ ] **Step 1: Read the full NotificationSettingsModal.tsx**

  Read `src/components/NotificationSettingsModal.tsx` in full to understand the current structure before editing.

- [ ] **Step 2: Extend the Settings interface**

  Find:
  ```ts
  interface Settings {
    webhookUrl: string | null
    lastNotifiedAt: string | null
    notifyHour: number | null
    notifyMinute: number | null
    notifyDays: string | null
  }
  ```

  Replace with:
  ```ts
  interface Settings {
    webhookUrl: string | null
    discordUserId: string | null
    discordUsername: string | null
    lastNotifiedAt: string | null
    notifyHour: number | null
    notifyMinute: number | null
    notifyDays: string | null
  }
  ```

- [ ] **Step 3: Add discordConnected state variable**

  After the existing state declarations (after `const [pushMessage, setPushMessage] = useState('')`), add:
  ```ts
  const [discordConnected, setDiscordConnected] = useState<string | null>(null) // stores discordUsername if connected
  const [disconnectingDiscord, setDisconnectingDiscord] = useState(false)
  ```

- [ ] **Step 4: Update useEffect to load discordUserId/Username from settings**

  In the existing `.then((data: Settings) => { ... })` block inside the first `fetch('/api/user/notification-settings')` chain, add after `setNotifyDaysArr(...)`:
  ```ts
  setDiscordConnected(data.discordUserId ? (data.discordUsername ?? data.discordUserId) : null)
  ```

  Also update the `.catch()` default object to include the new fields:
  ```ts
  setSettings({ webhookUrl: null, discordUserId: null, discordUsername: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null })
  ```

- [ ] **Step 5: Fix handleClear to use spread (prevents TypeScript error after Settings interface change)**

  The existing `handleClear` function resets settings with a hardcoded object literal. After adding `discordUserId`/`discordUsername` to the `Settings` interface, this will fail TypeScript with a missing fields error. Find in `handleClear`:
  ```ts
  setSettings({ webhookUrl: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null })
  ```
  Replace with:
  ```ts
  setSettings(prev => prev ? { ...prev, webhookUrl: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null } : prev)
  ```

- [ ] **Step 6: Add handleDiscordDisconnect function**

  After the `handleClear` function, add:
  ```ts
  async function handleDiscordDisconnect() {
    if (!confirm('Discord 연결을 해제할까요?')) return
    setDisconnectingDiscord(true)
    const res = await fetch('/api/auth/discord/disconnect', { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json() as { clearedSchedule?: boolean }
      setDiscordConnected(null)
      if (data.clearedSchedule) {
        setNotifyHour(null)
        setNotifyMinute(null)
        setNotifyDaysArr([])
        setSettings(prev => prev ? { ...prev, discordUserId: null, discordUsername: null, notifyHour: null, notifyMinute: null, notifyDays: null } : prev)
      } else {
        setSettings(prev => prev ? { ...prev, discordUserId: null, discordUsername: null } : prev)
      }
    }
    setDisconnectingDiscord(false)
  }
  ```

- [ ] **Step 7: Add Discord connect section to JSX**

  Find `{/* URL input / display */}` (around line 286 — the comment just above the webhook URL label). Insert the following block **before** this comment:

  ```tsx
  {/* Discord DM 알림 */}
  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Discord DM 알림</p>
    {discordConnected ? (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-900 dark:text-gray-100">
            <span className="text-green-600 dark:text-green-400 font-medium">✓ {discordConnected}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">DM으로 알림을 받습니다</p>
        </div>
        <button
          onClick={handleDiscordDisconnect}
          disabled={disconnectingDiscord}
          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline disabled:opacity-50"
        >
          {disconnectingDiscord ? '해제 중...' : '연결 해제'}
        </button>
      </div>
    ) : (
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">Discord 계정을 연결하면 DM으로 알림을 받습니다</p>
        <a
          href="/api/auth/discord/connect"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z"/>
          </svg>
          Discord로 연결하기
        </a>
      </div>
    )}
  </div>
  ```

  Then update the webhook URL section label to indicate it's a legacy/alternative option. Find the label text for the webhook URL input (likely "Discord 웹훅 URL" or similar) and change it to:
  ```
  Discord 채널 웹훅 URL (레거시)
  ```

- [ ] **Step 8: Update isConfigured check and fix "알림 해제" button scope**

  Find where `isConfigured` is computed. It currently checks only `settings?.webhookUrl`. Update it:
  ```ts
  const isConfigured = !!(settings?.webhookUrl || discordConnected)
  ```

  `isConfigured` gates the test button, schedule section, and save button — all of these should be visible when DM is connected.

  **However, the "알림 해제" (clear webhook) button must only show when a webhook URL is configured**, not for DM-only users (DM has its own "연결 해제" button). Find the JSX that shows the "알림 해제" button — it's currently gated on `isConfigured`. Change its condition to `!!settings?.webhookUrl`:
  ```tsx
  {/* Before: */}
  {isConfigured && !isEditing && (
    <button onClick={handleClear} ...>알림 해제</button>
  )}

  {/* After: */}
  {!!settings?.webhookUrl && !isEditing && (
    <button onClick={handleClear} ...>알림 해제</button>
  )}
  ```

- [ ] **Step 9: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add src/components/NotificationSettingsModal.tsx
  git commit -m "feat: add Discord DM connect/disconnect UI to notification settings"
  ```

---

### Task 11: Add env vars to .env.local

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add Discord env vars**

  Append to `.env.local`:
  ```
  # Discord DM Notifications (Bot + OAuth)
  DISCORD_BOT_TOKEN=your-bot-token-here
  DISCORD_CLIENT_ID=your-discord-client-id-here
  DISCORD_CLIENT_SECRET=your-discord-client-secret-here
  ```

  Replace the placeholder values with real values from the Discord Developer Portal (see spec for setup instructions: `docs/superpowers/specs/2026-03-15-discord-dm-notification-design.md`).

- [ ] **Step 2: Restart dev server**

  The dev server must be restarted for new env vars to take effect.

  ```bash
  # Kill existing dev server if running, then:
  npm run dev
  ```

- [ ] **Step 3: Manual end-to-end test**

  1. Open `http://localhost:3000` in browser
  2. Sign in with Google
  3. Go to `/favorites`
  4. Click 알림 설정
  5. Verify "Discord DM 알림" section appears at top with "Discord로 연결하기" button
  6. Click "Discord로 연결하기" → should redirect to Discord OAuth
  7. Authorize → should redirect back to `/favorites`
  8. Modal should now show your Discord username with "연결 해제" button
  9. Click "테스트 전송" → should receive a DM from the bot
  10. Click "연결 해제" → should return to unconnected state

- [ ] **Step 4: Skip — .env.local is already gitignored**

  `.gitignore` contains `.env*` which covers `.env.local`. The file will not be committed. No action needed.

---

## Verification

After all tasks complete:

```bash
# Final type check
npx tsc --noEmit

# Check no accidental console.log left in production paths
grep -r "console.log" src/app/api/auth/discord/
```

Expected: `tsc` — no errors. `grep` — no `console.log` (only `console.error` is acceptable).
