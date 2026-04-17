# Discord 알림 설정 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 즐겨찾기 페이지에서 개인 Discord Webhook URL을 설정하고, 가격 수집 시 사용자별 webhook으로 알림을 받을 수 있도록 한다.

**Architecture:** User 모델에 discordWebhookUrl/discordLastNotifiedAt 필드 추가 → 3개 API 엔드포인트 → Client Component 모달 → 수집기 알림 로직을 사용자별 per-user 루프로 교체.

**Tech Stack:** Next.js 14 App Router, Prisma + PostgreSQL, Auth.js v5, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-discord-notification-settings-design.md`

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `prisma/schema.prisma` | Modify | User 모델에 discordWebhookUrl, discordLastNotifiedAt 추가 |
| `src/lib/discord.ts` | Modify | sendWebhook throw on error, webhookUrl 파라미터화, 청크 오류 처리 |
| `src/app/api/user/notification-settings/route.ts` | Create | GET (조회), PUT (저장/해제) |
| `src/app/api/user/notification-settings/test/route.ts` | Create | POST (테스트 전송) |
| `src/components/NotificationSettingsModal.tsx` | Create | Client Component 모달 |
| `src/app/favorites/page.tsx` | Modify | 헤더에 알림 설정 버튼 + 모달 추가 |
| `src/collectors/auction.collector.ts` | Modify | per-user 알림 루프, saleDate optional, export |
| `scripts/notify-favorites.ts` | Modify | notifyFavoritesIfConfigured 재사용으로 단순화 |

---

## Chunk 1: DB + discord.ts 기반 작업

### Task 1: Prisma 스키마 변경 및 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: schema.prisma의 User 모델에 필드 추가**

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

  accounts  Account[]
  sessions  Session[]
  favorites Favorite[]

  @@map("users")
}
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
cd auction-monitor
npx prisma migrate dev --name add_discord_fields_to_users
```

Expected: migration 파일 생성 및 DB 적용 성공 메시지

- [ ] **Step 3: Prisma 클라이언트 재생성 확인**

마이그레이션 시 자동으로 재생성됨. 확인:
```bash
npx prisma generate
```

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add discordWebhookUrl and discordLastNotifiedAt to User model"
```

---

### Task 2: discord.ts 리팩터링

**Files:**
- Modify: `src/lib/discord.ts`

현재 `sendWebhook`은 `process.env.DISCORD_WEBHOOK_URL`을 읽고 오류 시 조용히 로그만 남긴다.
변경: `webhookUrl` 파라미터 추가, non-2xx 시 throw, 청크 개별 try/catch.

- [ ] **Step 1: discord.ts 전체 교체**

```typescript
// Discord webhook notifications for favorited products

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

async function sendWebhook(webhookUrl: string, embeds: DiscordEmbed[]) {
  const body = JSON.stringify({ username: '경매 모니터', embeds })

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'DiscordBot (https://github.com, 1.0)',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord webhook failed: ${res.status} ${text}`)
  }
}

function priceColor(changeRate: number | null): number {
  if (changeRate === null) return 0x95a5a6  // gray
  if (changeRate > 0) return 0xe74c3c       // red (가격 상승)
  if (changeRate < 0) return 0x3498db       // blue (가격 하락)
  return 0x2ecc71                           // green (변동 없음)
}

function formatChange(changeRate: number | null): string {
  if (changeRate === null) return '-'
  const sign = changeRate > 0 ? '▲' : changeRate < 0 ? '▼' : '━'
  return `${sign} ${Math.abs(changeRate).toFixed(1)}%`
}

export interface FavoriteProductPrice {
  productCode: string
  productName: string
  unit: string
  unitQty: number
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalVolume: number
  changeRate: number | null
  priceDate: string
}

export async function notifyFavoritesPrices(products: FavoriteProductPrice[], webhookUrl: string) {
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
      await sendWebhook(webhookUrl, embeds)
      successCount++
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[discord] Chunk send failed:`, err)
    }
  }

  if (successCount === 0 && lastError) {
    throw lastError
  }
}

export async function sendTestMessage(webhookUrl: string) {
  const embed: DiscordEmbed = {
    title: '✅ 연결 테스트 성공!',
    description: '경매 모니터에서 즐겨찾기 알림이 이 채널로 전송됩니다.',
    color: 0x2ecc71,
    fields: [],
    timestamp: new Date().toISOString(),
  }
  await sendWebhook(webhookUrl, [embed])
}
```

- [ ] **Step 2: TypeScript 컴파일 오류 없는지 확인**

```bash
npx tsc --noEmit
```

Expected: 오류 없음 (auction.collector.ts에서 타입 오류 발생하면 Task 6 이후 재확인)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/discord.ts
git commit -m "feat: refactor discord.ts — webhookUrl param, throw on error, per-chunk error handling"
```

---

## Chunk 2: API 엔드포인트

### Task 3: GET/PUT `/api/user/notification-settings`

**Files:**
- Create: `src/app/api/user/notification-settings/route.ts`

- [ ] **Step 1: 디렉터리 생성 및 파일 작성**

```typescript
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
```

- [ ] **Step 2: 수동 확인 — 앱 실행 후 API 테스트**

```bash
# 앱 실행 (별도 터미널)
npm run dev

# 로그인된 상태에서 curl 또는 브라우저 개발자 도구로 확인
curl -X GET http://localhost:3000/api/user/notification-settings \
  -H "Cookie: <로그인 쿠키>"
# Expected: { "webhookUrl": null, "lastNotifiedAt": null }
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/user/notification-settings/route.ts
git commit -m "feat: add GET/PUT /api/user/notification-settings"
```

---

### Task 4: POST `/api/user/notification-settings/test`

**Files:**
- Create: `src/app/api/user/notification-settings/test/route.ts`

- [ ] **Step 1: 파일 작성**

```typescript
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
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/user/notification-settings/test/route.ts
git commit -m "feat: add POST /api/user/notification-settings/test"
```

---

## Chunk 3: UI 컴포넌트

### Task 5: NotificationSettingsModal 컴포넌트

**Files:**
- Create: `src/components/NotificationSettingsModal.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```typescript
'use client'

import { useState, useEffect } from 'react'

interface Settings {
  webhookUrl: string | null
  lastNotifiedAt: string | null
}

function maskUrl(url: string): string {
  return 'https://discord.com/api/webhooks/****/****'
}

function formatKST(isoString: string): string {
  return new Date(isoString).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [inputUrl, setInputUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/user/notification-settings')
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data)
        if (data.webhookUrl) setInputUrl(data.webhookUrl)
      })
  }, [])

  async function handleSave() {
    setStatus('saving')
    setMessage('')
    const res = await fetch('/api/user/notification-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: inputUrl || null }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings(prev => ({ ...prev!, webhookUrl: inputUrl || null }))
      setIsEditing(false)
      setStatus('success')
      setMessage('저장됐습니다.')
    } else {
      setStatus('error')
      setMessage(data.error ?? '저장 실패')
    }
  }

  async function handleTest() {
    setStatus('testing')
    setMessage('')
    const res = await fetch('/api/user/notification-settings/test', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setStatus('success')
      setMessage('Discord에 테스트 메시지를 전송했습니다!')
    } else {
      setStatus('error')
      setMessage(data.error ?? '전송 실패')
    }
  }

  async function handleClear() {
    setStatus('saving')
    const res = await fetch('/api/user/notification-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: null }),
    })
    if (res.ok) {
      setSettings({ webhookUrl: null, lastNotifiedAt: null })
      setInputUrl('')
      setIsEditing(false)
      setStatus('idle')
      setMessage('')
    }
  }

  const isConfigured = !!settings?.webhookUrl

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">🔔 Discord 알림 설정</h2>
            <p className="text-xs text-gray-500 mt-0.5">즐겨찾기 품목의 가격 변동을 Discord로 받습니다</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {settings === null ? (
          <p className="text-sm text-gray-400 text-center py-4">불러오는 중...</p>
        ) : (
          <>
            {/* URL input / display */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Webhook URL</label>
              {isConfigured && !isEditing ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-500 truncate">
                    {maskUrl(settings.webhookUrl!)}
                  </span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-blue-500 hover:underline shrink-0"
                  >
                    수정
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              )}
              <p className="text-xs text-gray-400 mt-1">
                Discord 서버 설정 → 연동 → 웹후크에서 URL을 복사하세요
              </p>
            </div>

            {/* Last notified */}
            {isConfigured && settings.lastNotifiedAt && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 mb-4">
                <span className="text-green-600 text-sm">✓</span>
                <span className="text-xs text-green-700 dark:text-green-400">
                  마지막 전송: {formatKST(settings.lastNotifiedAt)}
                </span>
              </div>
            )}

            {/* Status message */}
            {message && (
              <p className={`text-xs mb-3 ${status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                {message}
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              {isConfigured && !isEditing && (
                <button
                  onClick={handleTest}
                  disabled={status === 'testing'}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50"
                >
                  {status === 'testing' ? '전송 중...' : '테스트 전송'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={status === 'saving'}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
              >
                {status === 'saving' ? '저장 중...' : '저장'}
              </button>
            </div>

            {/* Clear */}
            {isConfigured && (
              <div className="text-center mt-3">
                <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-600">
                  알림 해제
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/NotificationSettingsModal.tsx
git commit -m "feat: add NotificationSettingsModal component"
```

---

### Task 6: 즐겨찾기 페이지에 버튼 + 모달 연결

**Files:**
- Modify: `src/app/favorites/page.tsx`

현재 favorites/page.tsx는 Server Component이지만 모달은 Client Component이므로, 버튼+모달을 별도 Client Component로 분리한다.

- [ ] **Step 1: FavoritesHeader Client Component 생성**

`src/app/favorites/FavoritesHeader.tsx` 생성:

```typescript
'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const NotificationSettingsModal = dynamic(
  () => import('@/components/NotificationSettingsModal'),
  { ssr: false }
)

export default function FavoritesHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">★ 즐겨찾기</h1>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          🔔 알림 설정
        </button>
      </div>
      {open && <NotificationSettingsModal onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 2: favorites/page.tsx 헤더 교체**

기존 `<h1 className="text-2xl font-bold ...">★ 즐겨찾기</h1>` 블록을 `<FavoritesHeader />` import로 교체:

```typescript
// 상단 import 추가
import FavoritesHeader from './FavoritesHeader'

// JSX에서 h1 태그 대체
// 기존:
// <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
//   ★ 즐겨찾기
// </h1>
// 변경:
<FavoritesHeader />
```

- [ ] **Step 3: 수동 확인**

```bash
npm run dev
```

브라우저에서 `/favorites` 접속 → "🔔 알림 설정" 버튼 클릭 → 모달 표시 확인 → URL 입력 및 저장 확인

- [ ] **Step 4: 커밋**

```bash
git add src/app/favorites/FavoritesHeader.tsx src/app/favorites/page.tsx
git commit -m "feat: add notification settings button and modal to favorites page"
```

---

## Chunk 4: 알림 로직 + 스크립트

### Task 7: auction.collector.ts — per-user 알림 루프

**Files:**
- Modify: `src/collectors/auction.collector.ts`

- [ ] **Step 1: notifyFavoritesIfConfigured 함수 교체 및 export 추가**

`auction.collector.ts`에서 기존 `notifyFavoritesIfConfigured` 함수를 아래로 교체하고 `export` 추가:

```typescript
export async function notifyFavoritesIfConfigured(saleDate?: string) {
  // Find the target date: use provided saleDate or fall back to latest dailyPrice date
  let targetDate: string
  if (saleDate) {
    targetDate = saleDate
  } else {
    const latest = await prisma.dailyPrice.findFirst({
      orderBy: { priceDate: 'desc' },
      select: { priceDate: true },
    })
    if (!latest) return
    targetDate = latest.priceDate.toISOString().split('T')[0]
  }

  const priceDate = new Date(targetDate)

  // Find all users with a configured discord webhook
  const users = await prisma.user.findMany({
    where: { discordWebhookUrl: { not: null } },
    select: { id: true, discordWebhookUrl: true },
  })
  if (users.length === 0) return

  console.log(`[collector] Sending Discord notifications to ${users.length} users for ${targetDate}`)

  for (const user of users) {
    try {
      const favorites = await prisma.favorite.findMany({
        where: { userId: user.id },
        select: { productCode: true },
      })
      if (favorites.length === 0) continue

      const productCodes = favorites.map(f => f.productCode)

      const dailyPrices = await prisma.dailyPrice.findMany({
        where: {
          priceDate,
          product: { code: { in: productCodes } },
        },
        include: { product: true },
        orderBy: { product: { name: 'asc' } },
      })
      if (dailyPrices.length === 0) continue

      const payload = dailyPrices.map(d => ({
        productCode: d.product.code,
        productName: d.product.name,
        unit: d.product.unit,
        unitQty: d.product.unitQty,
        avgPrice: Number(d.avgPrice),
        minPrice: Number(d.minPrice),
        maxPrice: Number(d.maxPrice),
        totalVolume: Number(d.totalVolume),
        changeRate: d.changeRate ? Number(d.changeRate) : null,
        priceDate: targetDate,
      }))

      await notifyFavoritesPrices(payload, user.discordWebhookUrl!)
      await prisma.user.update({
        where: { id: user.id },
        data: { discordLastNotifiedAt: new Date() },
      })
      console.log(`[collector] Notified user ${user.id} (${payload.length} products)`)
    } catch (error) {
      console.error(`[collector] Failed to notify user ${user.id}:`, error)
    }
  }
}
```

`collectAuctionData` 함수 내 기존 `notifyFavoritesIfConfigured(saleDate)` 호출은 그대로 유지 (시그니처 호환됨).

- [ ] **Step 2: 글로벌 DISCORD_WEBHOOK_URL 참조 제거 확인 (Task 2 완료 후 실행)**

```bash
grep -n "DISCORD_WEBHOOK_URL" src/collectors/auction.collector.ts src/lib/discord.ts
```

Expected: 결과 없음 (Task 2의 discord.ts 수정이 선행되어야 함)

- [ ] **Step 3: TypeScript 오류 확인**

```bash
npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/collectors/auction.collector.ts
git commit -m "feat: refactor notifyFavoritesIfConfigured for per-user discord webhooks"
```

---

### Task 8: scripts/notify-favorites.ts 단순화

**Files:**
- Modify: `scripts/notify-favorites.ts`

- [ ] **Step 1: 스크립트 전체 교체**

```typescript
import { notifyFavoritesIfConfigured } from '../src/collectors/auction.collector'
import { prisma } from '../src/lib/db'

const targetDate = process.argv[2] // optional: YYYY-MM-DD

async function main() {
  await notifyFavoritesIfConfigured(targetDate)
  console.log('[notify-favorites] Done')
  await prisma.$disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: 실행 확인**

```bash
npx tsx --env-file=.env.local scripts/notify-favorites.ts
```

Expected: 각 사용자별 알림 전송 로그 출력

- [ ] **Step 3: 커밋**

```bash
git add scripts/notify-favorites.ts
git commit -m "feat: simplify notify-favorites script to reuse notifyFavoritesIfConfigured"
```

---

## Chunk 5: 최종 통합 확인

### Task 9: 전체 기능 수동 E2E 확인

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 모달 → URL 저장 → DB 확인**

1. `/favorites` 접속 → "🔔 알림 설정" 클릭
2. 유효한 Discord webhook URL 입력 → 저장
3. DB 확인:
```bash
npx tsx -e "
const {prisma} = require('./src/lib/db')
prisma.user.findFirst({ select: { discordWebhookUrl: true } }).then(console.log).finally(() => prisma.\$disconnect())
"
```
Expected: `{ discordWebhookUrl: 'https://discord.com/api/webhooks/...' }`

- [ ] **Step 3: 테스트 전송 확인**

모달에서 "테스트 전송" 클릭 → Discord 채널에 테스트 메시지 수신 확인

- [ ] **Step 4: 알림 해제 확인**

모달에서 "알림 해제" 클릭 → 미설정 상태로 전환 확인

- [ ] **Step 5: notify-favorites 스크립트 확인**

```bash
npx tsx --env-file=.env.local scripts/notify-favorites.ts
```

Expected: 사용자별 알림 전송 로그 + Discord 채널 수신 확인

- [ ] **Step 6: TypeScript 최종 확인**

```bash
npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 7: 최종 커밋**

```bash
git add -A
git status  # 스테이징 전 확인
git commit -m "feat: discord notification settings — per-user webhook configuration complete"
```
