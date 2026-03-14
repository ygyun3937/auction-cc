# Discord DM Notification Design

## Goal

Add Discord DM notifications as a primary channel alongside the existing webhook URL option. Users connect their Discord account via OAuth; the app bot sends DMs. Webhook remains as fallback/legacy.

## Architecture

### Notification Priority

```
If discordUserId set:
  1. Try Bot DM
  2. If DM fails → try discordWebhookUrl (if set)
Else if discordWebhookUrl set:
  → Send webhook
Web Push: always independent (unchanged)
```

Schedule fields (`discordNotifyHour`, `discordNotifyMinute`, `discordNotifyDays`) are shared across both Discord channels.

### OAuth Flow

"Connect account" flow — not a sign-in method. Auth.js is not modified.

```
User clicks [Discord로 연결하기]
→ GET /api/auth/discord/connect
    - verify session (must be logged in via auth())
    - generate nonce (crypto.randomUUID())
    - state = base64url(`${userId}:${nonce}:${hmac-sha256(userId:nonce, AUTH_SECRET)}`)
    - redirect to Discord OAuth:
        https://discord.com/oauth2/authorize
        ?client_id=DISCORD_CLIENT_ID
        &redirect_uri=AUTH_URL/api/auth/discord/callback  ← must match Discord app settings
        &response_type=code
        &scope=identify
        &state=...

→ Discord redirects to GET /api/auth/discord/callback?code=...&state=...
    - parse state: split by `:`, recompute HMAC, compare → reject if mismatch
    - POST https://discord.com/api/v10/oauth2/token (exchange code for access_token)
    - GET https://discord.com/api/v10/users/@me → { id, username, discriminator }
    - discard access_token (not stored — used once for identity only)
    - upsert discordUserId + discordUsername on User (by session userId)
    - if another User already has this discordUserId → return error (see Security)
    - redirect to /favorites

→ User sees Discord username in modal
```

Note: nonce is not stored server-side. The HMAC binding prevents CSRF: an attacker cannot forge a valid state for a target userId without knowing `AUTH_SECRET`.

---

### Sending DMs

```ts
// src/lib/discord.ts — new function
async function sendDM(discordUserId: string, embeds: DiscordEmbed[]): Promise<void> {
  // 1. Create/get DM channel
  const chanRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  })
  if (!chanRes.ok) throw new Error(`DM channel open failed: ${chanRes.status}`)
  const { id: channelId } = await chanRes.json()

  // 2. Send embeds (NO username field — bot name set in Discord Developer Portal)
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds }),
  })
  if (!msgRes.ok) throw new Error(`DM send failed: ${msgRes.status}`)
}

// Exported wrapper matching Discord lib conventions
export async function sendDMToUser(discordUserId: string, products: FavoriteProductPrice[]): Promise<void> {
  // same chunking logic as notifyFavoritesPrices, calls sendDM
}

export async function sendTestDM(discordUserId: string): Promise<void> {
  const embed: DiscordEmbed = {
    title: '✅ 연결 테스트 성공!',
    description: '경매 모니터에서 DM으로 알림이 전송됩니다.',
    color: 0x2ecc71,
    fields: [],
    timestamp: new Date().toISOString(),
  }
  await sendDM(discordUserId, [embed])
}
```

Important: `username` is NOT passed in bot message bodies — it is a webhook-only field. The bot's display name is configured in the Discord Developer Portal.

---

### Disconnect

`DELETE /api/auth/discord/disconnect`:
- Clears `discordUserId` and `discordUsername`
- **If no `discordWebhookUrl` is set**, also clears schedule fields (`discordNotifyHour`, `discordNotifyMinute`, `discordNotifyDays`) to prevent a notification blackout (cron would select the user but no channel exists)
- UI should display a confirmation if DM is the only active Discord channel

---

## Data Model

```prisma
model User {
  // existing — unchanged
  discordWebhookUrl     String?
  discordLastNotifiedAt DateTime?
  discordNotifyHour     Int?
  discordNotifyMinute   Int?
  discordNotifyDays     String?

  // new
  discordUserId         String?   @unique  // Discord snowflake user ID (unique per app user)
  discordUsername       String?            // display name, e.g. "yg"
}
```

Migration: `ADD COLUMN "discordUserId" TEXT UNIQUE, ADD COLUMN "discordUsername" TEXT` on `users`.

The `@unique` constraint prevents two app users from connecting the same Discord account.

---

## New Environment Variables

| Variable | Purpose |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token for sending DMs (server-only) |
| `DISCORD_CLIENT_ID` | OAuth2 app client ID (server-only) |
| `DISCORD_CLIENT_SECRET` | OAuth2 app client secret (server-only) |

The OAuth redirect URI is constructed as `${AUTH_URL}/api/auth/discord/callback` (using the existing `AUTH_URL` env var). This URI must be registered in the Discord Developer Portal under OAuth2 → Redirects.

No new `NEXT_PUBLIC_*` vars needed — the connect button hits `/api/auth/discord/connect` which handles the redirect server-side.

### Discord Bot Setup (one-time, by developer)

1. Discord Developer Portal → New Application
2. Bot tab → Add Bot → copy Token → set as `DISCORD_BOT_TOKEN`
3. OAuth2 tab → copy Client ID/Secret → set as `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
4. OAuth2 → Redirects → add `${AUTH_URL}/api/auth/discord/callback`
5. Bot Permissions: `Send Messages` (integer 2048). No guild membership required.
6. Bot does NOT need to share a server with users — DMs work with any Discord user ID, subject to their DM privacy settings. If a user has DMs disabled from non-friends, the DM will fail gracefully and fall back to webhook.

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `discordUserId @unique`, `discordUsername` |
| `prisma/migrations/...` | Auto-generated |
| `src/lib/discord.ts` | Add `sendDMToUser()`, `sendTestDM()` (internal `sendDM()` helper) |
| `src/app/api/auth/discord/connect/route.ts` | **New** — session check + HMAC state + OAuth redirect |
| `src/app/api/auth/discord/callback/route.ts` | **New** — state verify, code exchange, save discordUserId |
| `src/app/api/auth/discord/disconnect/route.ts` | **New** — clear Discord fields (+ cascade schedule if no webhook) |
| `src/app/api/user/notification-settings/route.ts` | Add `discordUserId`, `discordUsername` to `select` and GET response; update PUT webhook-clearing cascade: only clear schedule fields if BOTH `webhookUrl` is being cleared AND `discordUserId` is null |
| `src/app/api/user/notification-settings/test/route.ts` | DM-first, then webhook fallback |
| `src/collectors/auction.collector.ts` | DM-first/webhook-fallback in `notifyFavoritesForUser`; update `select` clause and early-return guard; update `notifyFavoritesIfConfigured` WHERE |
| `src/app/api/cron/notify/route.ts` | Add `{ discordUserId: { not: null } }` to OR |
| `src/components/NotificationSettingsModal.tsx` | Add Discord connect UI section |
| `.env.local` | Add 3 new vars |

---

## Collector Changes (detail)

### `notifyFavoritesForUser` — select clause

```ts
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    discordWebhookUrl: true,
    discordUserId: true,       // new
    pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
  },
})
```

### `notifyFavoritesForUser` — early-return guard

```ts
// Before (only checked webhook + push):
if (!user?.discordWebhookUrl && !user?.pushSubscriptions?.length) return

// After:
if (!user?.discordUserId && !user?.discordWebhookUrl && !user?.pushSubscriptions?.length) return
```

### `notifyFavoritesForUser` — Discord sending block

```ts
let discordSuccess = false

if (user.discordUserId) {
  try {
    await sendDMToUser(user.discordUserId, products)
    discordSuccess = true
  } catch (err) {
    console.error('[discord-dm] failed, trying webhook fallback:', err)
    if (user.discordWebhookUrl) {
      try {
        await notifyFavoritesPrices(products, user.discordWebhookUrl)
        discordSuccess = true
      } catch (webhookErr) {
        console.error('[discord-webhook] fallback also failed:', webhookErr)
      }
    }
  }
} else if (user.discordWebhookUrl) {
  try {
    await notifyFavoritesPrices(products, user.discordWebhookUrl)
    discordSuccess = true
  } catch (err) {
    console.error('[discord-webhook] failed:', err)
  }
}
```

### `notifyFavoritesIfConfigured` — WHERE clause

```ts
// Add to the existing OR array:
OR: [
  { discordWebhookUrl: { not: null } },
  { discordUserId: { not: null } },      // new
  { pushSubscriptions: { some: {} } },
]
```

---

## API: Notification Settings GET response

Updated shape:

```ts
{
  webhookUrl: string | null
  discordUserId: string | null      // new — "connected" if non-null
  discordUsername: string | null    // new — display in UI
  lastNotifiedAt: string | null
  notifyHour: number | null
  notifyMinute: number | null
  notifyDays: string | null
}
```

---

## UI

`NotificationSettingsModal` gains a new section **above** the existing webhook URL block:

```
─────────────────────────────────────────────
  Discord DM 알림
  [미연결]  [Discord로 연결하기 →]
─────────────────────────────────────────────
  [연결됨]  ✓ yg  Discord DM으로 알림을 받습니다
            [연결 해제]
─────────────────────────────────────────────
```

Clicking "Discord로 연결하기" navigates to `/api/auth/discord/connect` (full page navigation, not fetch — triggers OAuth redirect).

Existing webhook URL input remains below, labeled:
> "또는 Discord 채널 웹훅 URL (레거시)"

Test button behavior:
- Sends DM test if `discordUserId` is set, otherwise sends webhook test
- Returns `{ ok: bool, discord: bool, push: bool }` (unchanged shape)

---

## Test Route Changes

```ts
// src/app/api/user/notification-settings/test/route.ts
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: {
    discordUserId: true,          // new
    discordWebhookUrl: true,
    pushSubscriptions: { ... },
  },
})

// Discord test: DM first, webhook fallback
if (user.discordUserId) {
  try { await sendTestDM(user.discordUserId); discordOk = true }
  catch { /* try webhook */ }
}
if (!discordOk && user.discordWebhookUrl) {
  try { await sendTestMessage(user.discordWebhookUrl); discordOk = true }
  catch { /* continue */ }
}
```

---

## Security

- **OAuth state CSRF**: state = `base64url(userId:nonce:hmac-sha256(userId:nonce, AUTH_SECRET))`. Callback recomputes HMAC and rejects mismatch. Nonce not stored server-side (HMAC binding is sufficient for this low-risk connect flow).
- **Duplicate Discord account**: `discordUserId` has `@unique` DB constraint. Callback returns 409 if another user already has this Discord ID.
- **Bot token**: server-only, never exposed to client.
- **Access token**: used once to call `/users/@me`, then discarded — not stored.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| User has DMs closed / bot not in shared server | DM fails → fall through to webhook fallback; if no webhook, log and skip |
| Invalid/expired OAuth state | Redirect to `/favorites?error=discord_auth_failed` |
| Duplicate Discord ID (another user) | Redirect to `/favorites?error=discord_already_linked` |
| Discord API 429 (rate limit) | Propagate error → cron skips this user for this cycle; retry next cycle |
| DM fails + no webhook | `discordSuccess = false`, Push still attempted independently |

### Rate Limit Note

Cron sends DMs sequentially (already the case — one user at a time). Discord's per-bot DM rate limit is ~5 req/sec; with sequential processing and typical user counts this is not an issue. No additional delay needed unless user count exceeds ~100 concurrent notifications.
