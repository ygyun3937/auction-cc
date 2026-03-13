# Web Push 알림 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저 Web Push API를 통해 사용자가 별도 앱 없이 즐겨찾기 품목 가격 알림을 핸드폰/PC에서 받을 수 있게 한다.

**Architecture:** Prisma에 PushSubscription 모델 추가, `web-push` 패키지로 서버에서 VAPID 기반 푸시 발송, `public/sw.js` 서비스 워커가 알림 수신. Discord와 Web Push는 독립 채널로 각각 시도하며 기존 스케줄 필드를 공유한다.

**Tech Stack:** Next.js 14 App Router, Prisma 5 + PostgreSQL, TypeScript, Auth.js v5, `web-push` npm package, Web Push API, Service Worker

**Spec:** `docs/superpowers/specs/2026-03-14-web-push-notification-design.md`

---

## File Structure

| 파일 | 작업 | 역할 |
|------|------|------|
| `prisma/schema.prisma` | Modify | PushSubscription 모델 추가, User 역관계 추가 |
| `src/lib/webpush.ts` | Create | VAPID 초기화 + sendPushNotification 함수 |
| `src/app/api/user/push-subscription/route.ts` | Create | GET/POST/DELETE 구독 관리 엔드포인트 |
| `src/collectors/auction.collector.ts` | Modify | notifyFavoritesForUser Web Push 발송 추가, notifyFavoritesIfConfigured WHERE 변경 |
| `src/app/api/cron/notify/route.ts` | Modify | WHERE 조건에 pushSubscriptions OR 추가 |
| `public/sw.js` | Create | 서비스 워커 — push/notificationclick 이벤트 처리 |
| `src/components/PushNotificationManager.tsx` | Create | SW 등록 전담 Client Component |
| `src/app/layout.tsx` | Modify | PushNotificationManager 마운트 |
| `src/components/NotificationSettingsModal.tsx` | Modify | Web Push 구독/해제 UI 섹션 추가 |

---

## Chunk 1: 인프라 — DB 스키마 + webpush 라이브러리

### Task 1: web-push 패키지 설치 + Prisma 스키마 변경 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: web-push 패키지 설치**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

설치 후 확인:
```bash
node -e "require('web-push'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 2: VAPID 키 생성 (로컬 메모용)**

```bash
npx web-push generate-vapid-keys
```

출력된 두 키를 기록해둔다. `.env.local`에 다음 4개 변수를 추가한다 (나중에 Vercel 환경변수에도 동일하게 추가 필요):

```
VAPID_PUBLIC_KEY=<위에서 출력된 Public Key>
VAPID_PRIVATE_KEY=<위에서 출력된 Private Key>
VAPID_SUBJECT=mailto:admin@example.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<Public Key와 동일>
```

**주의:** `VAPID_SUBJECT`는 배포 전 실제 운영 이메일로 교체 필수.

**중요:** `VAPID_*` 환경변수는 런타임뿐만 아니라 **빌드 시점**에도 필요하다. `webpush.ts`가 처음 import될 때 모듈 레벨 assertion이 실행되므로, Vercel / CI 빌드 환경에도 반드시 설정해야 한다. 없으면 빌드 자체가 실패한다.

프로젝트에 `.env.example`이 있으면 다음 4줄을 추가한다:

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

- [ ] **Step 3: prisma/schema.prisma에 PushSubscription 모델 추가**

`prisma/schema.prisma`의 `Favorite` 모델 아래에 추가:

```prisma
model PushSubscription {
  id        Int      @id @default(autoincrement())
  userId    String
  endpoint  String   @unique  // 브라우저/기기별 고유 push URL
  p256dh    String            // 암호화 공개키
  auth      String            // 인증 시크릿
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("push_subscriptions")
}
```

- [ ] **Step 4: User 모델에 역관계 추가**

`prisma/schema.prisma`의 `User` 모델에서 `favorites Favorite[]` 아래에 추가:

```prisma
  pushSubscriptions PushSubscription[]
```

User 모델 전체는 다음과 같아야 한다:
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

  accounts          Account[]
  sessions          Session[]
  favorites         Favorite[]
  pushSubscriptions PushSubscription[]

  @@map("users")
}
```

- [ ] **Step 5: Prisma 마이그레이션 실행**

```bash
npx prisma migrate dev --name add_push_subscriptions
```

Expected: 에러 없이 완료 (`Your database is now in sync with your schema` 또는 `The following migration(s) have been created and applied` 등 Prisma 버전에 따라 메시지가 다를 수 있음)

- [ ] **Step 6: TypeScript 타입 확인**

`migrate dev`는 내부적으로 `prisma generate`를 실행하므로 별도 generate 불필요.

```bash
npx tsc --noEmit && echo "no errors"
```

Expected: `no errors`

- [ ] **Step 7: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/ package.json package-lock.json
# .env.example을 수정했다면 함께 스테이징
git add .env.example 2>/dev/null || true
git commit -m "feat: add PushSubscription model and install web-push"
```

---

### Task 2: src/lib/webpush.ts 생성

**Files:**
- Create: `src/lib/webpush.ts`

- [ ] **Step 1: webpush.ts 파일 생성**

```typescript
// src/lib/webpush.ts
import webpush from 'web-push'

if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  throw new Error('VAPID env vars are not set (VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

export interface PushPayload {
  title: string
  body: string
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
  )
}
```

- 발송 실패 시 `web-push`가 `WebPushError`(`.statusCode` 포함)를 throw한다. 이 함수는 그것을 그대로 re-throw한다 (catch 없음).
- 호출자(`notifyFavoritesForUser`)가 per-subscription try/catch로 처리한다.

- [ ] **Step 2: TypeScript 컴파일 확인**

`tsconfig.json`에 `esModuleInterop: true`가 설정되어 있으므로 `import webpush from 'web-push'` default import가 정상 동작한다.

```bash
npx tsc --noEmit && echo "no errors"
```

Expected: `no errors`

- [ ] **Step 3: 커밋**

```bash
git add src/lib/webpush.ts
git commit -m "feat: add webpush lib with VAPID setup"
```

---

## Chunk 2: 서버 사이드 — API 엔드포인트 + 알림 로직

### Task 3: /api/user/push-subscription 엔드포인트 (GET/POST/DELETE)

**Files:**
- Create: `src/app/api/user/push-subscription/route.ts`

기존 패턴 참고: `src/app/api/user/notification-settings/route.ts`

- [ ] **Step 1: 디렉토리 및 파일 생성**

```typescript
// src/app/api/user/push-subscription/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/../auth'
import { prisma } from '@/lib/db'

// GET: 현재 사용자의 모든 구독 endpoint 목록 반환
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    select: { endpoint: true },
  })

  return NextResponse.json({ endpoints: subs.map(s => s.endpoint) })
}

// POST: 새 구독 등록 (같은 userId+endpoint면 upsert, 다른 userId면 409)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { endpoint, keys } = body ?? {}
  const p256dh = keys?.p256dh
  const authKey = keys?.auth

  // Validate all fields are non-empty strings
  if (
    typeof endpoint !== 'string' || !endpoint.trim() ||
    typeof p256dh !== 'string' || !p256dh.trim() ||
    typeof authKey !== 'string' || !authKey.trim()
  ) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Check if endpoint already belongs to a different user
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  })
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Endpoint already registered' }, { status: 409 })
  }

  // Upsert: same user → update keys; new → create
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth: authKey },
    create: { userId: session.user.id, endpoint, p256dh, auth: authKey },
  })

  return NextResponse.json({ ok: true })
}

// DELETE: 구독 해제
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { endpoint } = body ?? {}

  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  })

  // Endpoint belongs to another user → 403
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Not found → noop 200
  if (!existing) {
    return NextResponse.json({ ok: true })
  }

  await prisma.pushSubscription.delete({ where: { endpoint } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음 (출력이 없거나 타입 에러 줄 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/user/push-subscription/route.ts
git commit -m "feat: add push-subscription API endpoints (GET/POST/DELETE)"
```

---

### Task 4: notifyFavoritesForUser + notifyFavoritesIfConfigured 수정

**Files:**
- Modify: `src/collectors/auction.collector.ts`

**주의:** 이 파일은 매우 길다. 변경 대상 함수는 파일 하단의 `notifyFavoritesForUser`(409번째 줄)와 `notifyFavoritesIfConfigured`(473번째 줄)다. 나머지 코드는 건드리지 않는다.

변경 전 `notifyFavoritesForUser`는 `discordWebhookUrl` 없으면 즉시 return한다. 변경 후에는 Discord + Web Push를 독립 채널로 처리한다.

- [ ] **Step 1: import 추가**

파일 상단 imports에 webpush import 추가:

```typescript
import { sendPushNotification } from '@/lib/webpush'
```

기존 import 블록:
```typescript
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { fetchAuctionData } from '@/lib/api-client'
import type { KatRealTimeItem } from '@/lib/api-client'
import { notifyFavoritesPrices } from '@/lib/discord'
```

변경 후:
```typescript
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { fetchAuctionData } from '@/lib/api-client'
import type { KatRealTimeItem } from '@/lib/api-client'
import { notifyFavoritesPrices } from '@/lib/discord'
import { sendPushNotification } from '@/lib/webpush'
```

- [ ] **Step 2: notifyFavoritesForUser 함수 전체 교체**

기존 함수(409~471번 줄)를 아래 코드로 교체한다:

```typescript
export async function notifyFavoritesForUser(userId: string, saleDate?: string): Promise<void> {
  // 1. 사용자 조회 (Discord webhook + push subscriptions 함께)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      discordWebhookUrl: true,
      pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
    },
  })

  // 2. 알림 채널 없으면 noop
  if (!user?.discordWebhookUrl && (!user?.pushSubscriptions || user.pushSubscriptions.length === 0)) return

  // 3. 날짜 결정
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

  // 4. 즐겨찾기 + dailyPrices 조회
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    select: { productCode: true },
  })
  if (favorites.length === 0) return

  const productCodes = favorites.map(f => f.productCode)

  const dailyPrices = await prisma.dailyPrice.findMany({
    where: {
      priceDate,
      product: { code: { in: productCodes } },
    },
    include: { product: true },
    orderBy: { product: { name: 'asc' } },
  })
  if (dailyPrices.length === 0) return

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

  // 5. 성공 추적
  let discordSuccess = false
  let pushSuccess = false

  // 6. Discord 발송 (webhook 있는 경우만)
  if (user.discordWebhookUrl) {
    try {
      await notifyFavoritesPrices(payload, user.discordWebhookUrl)
      discordSuccess = true
    } catch (err) {
      console.error(`[collector] Discord notification failed for user ${userId}:`, err)
    }
  }

  // 7. Web Push 발송 (구독 있는 경우)
  if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
    // Web Push 메시지 body 생성
    const first = payload[0]
    const priceStr = Math.round(first.avgPrice).toLocaleString('ko-KR')
    const pushBody = payload.length === 1
      ? `${first.productName} ${priceStr}원`
      : `${first.productName} ${priceStr}원 외 ${payload.length - 1}개 품목`

    const pushPayload = { title: '즐겨찾기 가격 알림', body: pushBody }

    for (const sub of user.pushSubscriptions) {
      try {
        await sendPushNotification(sub, pushPayload)
        pushSuccess = true
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          // 만료된 구독 — DB에서 삭제
          try {
            await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } })
          } catch (deleteErr) {
            console.error(`[collector] Failed to delete expired push subscription for user ${userId}:`, deleteErr)
          }
        } else {
          console.error(`[collector] Web Push failed for user ${userId} endpoint ${sub.endpoint}:`, err)
        }
      }
    }
  }

  // 8. 하나라도 성공한 경우 discordLastNotifiedAt 업데이트
  if (discordSuccess || pushSuccess) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { discordLastNotifiedAt: new Date() },
      })
    } catch (err) {
      console.error(`[collector] Failed to update discordLastNotifiedAt for user ${userId}:`, err)
    }
  }
}
```

- [ ] **Step 3: notifyFavoritesIfConfigured WHERE 조건 변경**

기존 WHERE (488~493번 줄):
```typescript
  const users = await prisma.user.findMany({
    where: {
      discordWebhookUrl: { not: null },
      discordNotifyHour: null,
    },
    select: { id: true },
  })
```

변경 후:
```typescript
  const users = await prisma.user.findMany({
    where: {
      discordNotifyHour: null,
      OR: [
        { discordWebhookUrl: { not: null } },
        { pushSubscriptions: { some: {} } },
      ],
    },
    select: { id: true },
  })
```

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/collectors/auction.collector.ts
git commit -m "feat: extend notifyFavoritesForUser with Web Push support"
```

---

### Task 5: /api/cron/notify WHERE 조건 업데이트

**Files:**
- Modify: `src/app/api/cron/notify/route.ts`

- [ ] **Step 1: users 조회 WHERE 조건 변경**

기존 (24~29번 줄):
```typescript
  const users = await prisma.user.findMany({
    where: {
      discordWebhookUrl: { not: null },
      discordNotifyHour: { not: null },
      discordNotifyMinute: { not: null },
    },
```

변경 후:
```typescript
  const users = await prisma.user.findMany({
    where: {
      discordNotifyHour: { not: null },
      discordNotifyMinute: { not: null },
      OR: [
        { discordWebhookUrl: { not: null } },
        { pushSubscriptions: { some: {} } },
      ],
    },
```

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/cron/notify/route.ts
git commit -m "feat: include push-only users in schedule cron notify"
```

---

## Chunk 3: 클라이언트 사이드 — SW + UI

### Task 6: Service Worker (public/sw.js)

**Files:**
- Create: `public/sw.js`

`public/` 디렉토리에 놓으면 Next.js가 그대로 정적 서빙한다. 빌드 과정 없음. `process.env` 사용 불가 (알려진 제한).

- [ ] **Step 1: public/sw.js 생성**

```javascript
// public/sw.js
self.addEventListener('push', event => {
  let data = { title: '알림', body: '' }
  if (event.data) {
    try { data = event.data.json() } catch (_) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
```

- [ ] **Step 2: SW 접근 가능 확인**

별도 터미널에서 개발 서버를 먼저 실행한다:
```bash
npm run dev
```

서버가 뜨면 확인:
```bash
curl -s http://localhost:3000/sw.js | head -3
```
Expected: `// public/sw.js` 첫 줄이 보임

- [ ] **Step 3: 커밋**

```bash
git add public/sw.js
git commit -m "feat: add service worker for web push notifications"
```

---

### Task 7: PushNotificationManager 컴포넌트 + layout.tsx 마운트

**Files:**
- Create: `src/components/PushNotificationManager.tsx`
- Modify: `src/app/layout.tsx`

**역할:** SW 등록만 담당. 구독/해제 로직은 NotificationSettingsModal에서 처리.

- [ ] **Step 1: PushNotificationManager.tsx 생성**

```typescript
// src/components/PushNotificationManager.tsx
'use client'

import { useEffect } from 'react'

export default function PushNotificationManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    async function registerSW() {
      try {
        // 이미 등록된 SW가 있으면 재등록하지 않음
        const existing = await navigator.serviceWorker.getRegistration('/sw.js')
        if (existing) return
        await navigator.serviceWorker.register('/sw.js')
      } catch (err) {
        console.error('[PushNotificationManager] SW registration failed:', err)
      }
    }

    registerSW()
  }, [])

  return null
}
```

- [ ] **Step 2: layout.tsx에 PushNotificationManager 마운트**

`src/app/layout.tsx`를 수정한다. import 추가 및 `<Providers>` 내부에 마운트.

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import PushNotificationManager from '@/components/PushNotificationManager'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '전국 농수산물 경매 모니터링',
  description: '전국 공영도매시장 농수산물 경매 가격 정보를 모니터링합니다.',
  keywords: '농수산물, 경매, 도매시장, 가격정보, 농산물',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <PushNotificationManager />
          <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
            <Header />
            <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
              {children}
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/PushNotificationManager.tsx src/app/layout.tsx
git commit -m "feat: add PushNotificationManager for SW registration"
```

---

### Task 8: NotificationSettingsModal — Web Push 섹션 추가

**Files:**
- Modify: `src/components/NotificationSettingsModal.tsx`

현재 파일: `src/components/NotificationSettingsModal.tsx` (293줄)

Web Push 섹션을 Discord URL 섹션 **위에** 추가한다. 모달 열릴 때 서버 구독 목록과 현재 기기 구독 상태를 조회하여 `isSubscribed` 상태를 설정한다.

- [ ] **Step 1: 상태 변수 + 초기 로딩 로직 추가**

`useState` 블록에 다음 추가 (기존 `notifyDaysArr` 아래):

```typescript
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [serverEndpoints, setServerEndpoints] = useState<string[]>([])
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
```

기존 `useEffect(() => { ... }, [])` 블록 **전체**를 아래 코드로 **교체**한다. (Web Push 초기 로딩 코드가 기존 `.catch()` 블록 직후에 포함되어 있음):

```typescript
  useEffect(() => {
    // 기존 notification-settings fetch
    fetch('/api/user/notification-settings')
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data)
        if (data.webhookUrl) setInputUrl(data.webhookUrl)
        setNotifyHour(data.notifyHour)
        setNotifyMinute(data.notifyMinute)
        setNotifyDaysArr(
          data.notifyDays ? data.notifyDays.split(',').map(Number) : []
        )
      })
      .catch(() => {
        setSettings({ webhookUrl: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null })
      })

    // Web Push 초기 로딩
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return
    setPushSupported(true)

    async function loadPushState() {
      try {
        const [serverRes, registration] = await Promise.all([
          fetch('/api/user/push-subscription').then(r => r.json()),
          navigator.serviceWorker.getRegistration('/sw.js'),
        ])
        const endpoints: string[] = serverRes.endpoints ?? []
        setServerEndpoints(endpoints)

        if (!registration) {
          setSwRegistration(null)
          setIsSubscribed(false)
          return
        }
        setSwRegistration(registration)

        const sub = await registration.pushManager.getSubscription()
        setIsSubscribed(sub ? endpoints.includes(sub.endpoint) : false)
      } catch {
        // 조회 실패 시 미구독 상태로 표시
        setIsSubscribed(false)
      }
    }
    loadPushState()
  }, [])
```

- [ ] **Step 2: base64url→Uint8Array 헬퍼 + 구독/해제 핸들러 추가**

컴포넌트 함수 내부 (기존 `handleClear` 함수 아래)에 추가:

```typescript
  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
  }

  async function handlePushSubscribe() {
    setPushMessage('')
    if (!swRegistration) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setPushMessage('브라우저 설정에서 알림을 허용해주세요')
      return
    }

    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subJson = sub.toJSON()
      const res = await fetch('/api/user/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
        }),
      })

      if (!res.ok) {
        throw new Error(`Server rejected subscription: ${res.status}`)
      }

      setIsSubscribed(true)
      setServerEndpoints(prev => [...prev, sub.endpoint])
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
      setPushMessage('구독 중 오류가 발생했습니다')
    }
  }

  async function handlePushUnsubscribe() {
    setPushMessage('')
    if (!swRegistration) return

    try {
      const sub = await swRegistration.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        const delRes = await fetch('/api/user/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        if (!delRes.ok) {
          throw new Error(`Server rejected unsubscribe: ${delRes.status}`)
        }
        setServerEndpoints(prev => prev.filter(e => e !== sub.endpoint))
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
      setPushMessage('구독 해제 중 오류가 발생했습니다')
    }
  }
```

- [ ] **Step 3: JSX — Web Push 섹션 추가**

기존 JSX에서 `{/* URL input / display */}` 블록 **바로 위에** Web Push 섹션 삽입:

```tsx
            {/* Web Push 알림 섹션 */}
            {pushSupported && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">브라우저 알림 (Web Push)</label>
                {isSubscribed ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-700 dark:text-green-400">
                      이 기기에서 구독 중 ({serverEndpoints.length}개 기기)
                    </span>
                    <button
                      onClick={handlePushUnsubscribe}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      구독 해제
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handlePushSubscribe}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold"
                  >
                    이 기기에서 알림 받기
                  </button>
                )}
                {pushMessage && (
                  <p className="text-xs text-red-500 mt-1">{pushMessage}</p>
                )}
              </div>
            )}
```

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 5: 빌드 확인**

```bash
npm run build 2>&1 | tail -20
```

Expected: 에러 없이 빌드 완료

- [ ] **Step 6: 커밋**

```bash
git add src/components/NotificationSettingsModal.tsx
git commit -m "feat: add web push subscription UI to NotificationSettingsModal"
```

---

## 완료 후 수동 검증 체크리스트

- [ ] 브라우저에서 앱 로드 → DevTools > Application > Service Workers에 `/sw.js` 등록 확인
- [ ] NotificationSettingsModal 열기 → "브라우저 알림 (Web Push)" 섹션 표시 확인
- [ ] "이 기기에서 알림 받기" 클릭 → 권한 요청 팝업 → 허용 → "이 기기에서 구독 중 (1개 기기)" 표시
- [ ] `GET /api/user/push-subscription` 응답에 endpoint 포함 확인
- [ ] "구독 해제" 클릭 → 미구독 상태로 전환 확인
- [ ] Safari (iOS 16 이하): 섹션 미표시 확인 (pushSupported = false)

## 환경변수 배포 체크리스트

Vercel 대시보드에 다음 4개 환경변수 추가 (Production + Preview):
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (실제 운영 이메일로 교체)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (VAPID_PUBLIC_KEY와 동일 값)
