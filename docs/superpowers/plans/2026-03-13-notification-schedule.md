# 알림 스케줄 설정 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 원하는 시간/요일에 즐겨찾기 품목의 Discord 알림을 받을 수 있도록 스케줄 설정 기능을 추가한다.

**Architecture:** DB에 3개의 nullable 스케줄 필드 추가 → 단일 사용자 알림 함수(`notifyFavoritesForUser`) 도입 → 기존 수집 크론에서 스케줄 설정 사용자 제외 → 30분 간격 스케줄 크론 신설 → 기존 알림 설정 API/모달에 스케줄 필드 추가.

**Tech Stack:** Next.js 14 App Router, Prisma 5 + PostgreSQL, TypeScript, Tailwind CSS, Auth.js v5

---

## Chunk 1: DB + 백엔드 로직

### Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (User 모델)

- [ ] **Step 1: schema.prisma User 모델에 3개 필드 추가**

`discordLastNotifiedAt DateTime?` 바로 아래에 추가:

```prisma
  discordNotifyHour   Int?
  discordNotifyMinute Int?
  discordNotifyDays   String?
```

결과:
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

  accounts  Account[]
  sessions  Session[]
  favorites Favorite[]

  @@map("users")
}
```

- [ ] **Step 2: 마이그레이션 생성 및 적용**

```bash
cd /Users/yg/project/cc-project/dd-project/auction-monitor
npx prisma migrate dev --name add_discord_notify_schedule_to_users
```

Expected: `Your database is now in sync with your schema.` 출력.

- [ ] **Step 3: Prisma 클라이언트 재생성 확인**

마이그레이션 완료 시 자동으로 클라이언트가 재생성됨. 확인:

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 타입 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add discord notify schedule fields to users"
```

---

### Task 2: `notifyFavoritesForUser` 추가 + `notifyFavoritesIfConfigured` 리팩토링

**이 두 변경은 반드시 같은 커밋에서 적용해야 한다.** 분리하면 수집 크론이 스케줄 설정 사용자에게 알림을 보내거나 건너뛰는 일시적 오작동이 발생한다.

**Files:**
- Modify: `src/collectors/auction.collector.ts` (409~477번째 줄 부근)

- [ ] **Step 1: 현재 `notifyFavoritesIfConfigured` 함수 전체를 새 구현으로 교체**

`src/collectors/auction.collector.ts`의 `notifyFavoritesIfConfigured` 함수(line ~409)를 다음으로 교체한다:

```typescript
export async function notifyFavoritesForUser(userId: string, saleDate?: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordWebhookUrl: true },
  })
  if (!user?.discordWebhookUrl) return

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

  await notifyFavoritesPrices(payload, user.discordWebhookUrl)

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { discordLastNotifiedAt: new Date() },
    })
  } catch (err) {
    console.error(`[collector] Failed to update discordLastNotifiedAt for user ${userId}:`, err)
  }
}

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

  // Only notify users WITHOUT a schedule (schedule users are handled by /api/cron/notify)
  const users = await prisma.user.findMany({
    where: {
      discordWebhookUrl: { not: null },
      discordNotifyHour: null,
    },
    select: { id: true },
  })
  if (users.length === 0) return

  console.log(`[collector] Sending Discord notifications to ${users.length} users for ${targetDate}`)

  for (const user of users) {
    try {
      await notifyFavoritesForUser(user.id, targetDate)
      console.log(`[collector] Notified user ${user.id}`)
    } catch (error) {
      console.error(`[collector] Failed to notify user ${user.id}:`, error)
    }
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/collectors/auction.collector.ts
git commit -m "feat: add notifyFavoritesForUser, refactor notifyFavoritesIfConfigured to exclude schedule users"
```

---

### Task 3: GET/PUT `/api/user/notification-settings` 스케줄 필드 확장

**Files:**
- Modify: `src/app/api/user/notification-settings/route.ts`

- [ ] **Step 1: GET 핸들러 — select 및 응답에 스케줄 필드 추가**

현재 GET 핸들러의 `select`와 응답을 업데이트한다:

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
    select: {
      discordWebhookUrl: true,
      discordLastNotifiedAt: true,
      discordNotifyHour: true,
      discordNotifyMinute: true,
      discordNotifyDays: true,
    },
  })

  return NextResponse.json({
    webhookUrl: user?.discordWebhookUrl ?? null,
    lastNotifiedAt: user?.discordLastNotifiedAt?.toISOString() ?? null,
    notifyHour: user?.discordNotifyHour ?? null,
    notifyMinute: user?.discordNotifyMinute ?? null,
    notifyDays: user?.discordNotifyDays ?? null,
  })
}
```

- [ ] **Step 2: PUT 핸들러 — 스케줄 필드 유효성 검사 및 저장 로직 추가**

PUT 핸들러를 전체 교체:

```typescript
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { webhookUrl, notifyHour, notifyMinute, notifyDays } = body

  // 1. webhookUrl null/empty → cascade clear all schedule fields
  if (!webhookUrl) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        discordWebhookUrl: null,
        discordNotifyHour: null,
        discordNotifyMinute: null,
        discordNotifyDays: null,
      },
    })
    return NextResponse.json({ ok: true })
  }

  // 2. Validate webhookUrl
  if (!WEBHOOK_URL_REGEX.test(webhookUrl)) {
    return NextResponse.json({ error: 'Invalid webhook URL format' }, { status: 400 })
  }

  // 3. Validate schedule fields
  // notifyHour: null or integer 0-23
  if (notifyHour !== null && notifyHour !== undefined) {
    if (typeof notifyHour !== 'number' || !Number.isInteger(notifyHour) || notifyHour < 0 || notifyHour > 23) {
      return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
    }
  }

  // notifyMinute: null or 0 or 30
  if (notifyMinute !== null && notifyMinute !== undefined) {
    if (notifyMinute !== 0 && notifyMinute !== 30) {
      return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
    }
  }

  // notifyHour and notifyMinute must both be null or both be set
  const hourSet = notifyHour !== null && notifyHour !== undefined
  const minuteSet = notifyMinute !== null && notifyMinute !== undefined
  if (hourSet !== minuteSet) {
    return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
  }

  // notifyDays: null, empty string → null; otherwise validate
  let normalizedDays: string | null = null
  const rawDays = notifyDays === '' ? null : (notifyDays ?? null)
  if (rawDays !== null) {
    const parts = rawDays.split(',')
    const nums: number[] = []
    for (const part of parts) {
      if (!/^[0-6]$/.test(part)) {
        return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
      }
      const n = parseInt(part, 10)
      if (nums.includes(n)) {
        return NextResponse.json({ error: 'Invalid schedule settings' }, { status: 400 })
      }
      nums.push(n)
    }
    normalizedDays = nums.sort((a, b) => a - b).join(',')
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      discordWebhookUrl: webhookUrl,
      discordNotifyHour: hourSet ? notifyHour : null,
      discordNotifyMinute: minuteSet ? notifyMinute : null,
      discordNotifyDays: normalizedDays,
    },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/user/notification-settings/route.ts
git commit -m "feat: extend notification-settings API with schedule fields"
```

---

### Task 4: `POST /api/cron/notify` 신설 + vercel.json 업데이트

**Files:**
- Create: `src/app/api/cron/notify/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: `src/app/api/cron/notify/route.ts` 생성**

```typescript
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

  // Calculate current KST time
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const hour = kstNow.getUTCHours()        // 0-23
  const minute = kstNow.getUTCMinutes()    // 0 or 30 (raw floor)
  const dayOfWeek = kstNow.getUTCDay()     // 0=Sun ~ 6=Sat

  // Find all users with webhook + schedule configured
  const users = await prisma.user.findMany({
    where: {
      discordWebhookUrl: { not: null },
      discordNotifyHour: { not: null },
      discordNotifyMinute: { not: null },
    },
    select: {
      id: true,
      discordNotifyHour: true,
      discordNotifyMinute: true,
      discordNotifyDays: true,
    },
  })

  // Filter by current hour/minute
  const targets = users.filter(u => {
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
```

- [ ] **Step 2: `vercel.json`에 새 크론 추가**

```json
{
  "crons": [
    { "path": "/api/cron/collect", "schedule": "0 1 * * *" },
    { "path": "/api/cron/collect-grades", "schedule": "0 18,19,20,21,22,23 * * 1-6" },
    { "path": "/api/cron/notify", "schedule": "*/30 * * * *" }
  ]
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/cron/notify/route.ts vercel.json
git commit -m "feat: add /api/cron/notify schedule cron endpoint"
```

---

## Chunk 2: UI

### Task 5: `NotificationSettingsModal.tsx` 스케줄 UI 추가

**Files:**
- Modify: `src/components/NotificationSettingsModal.tsx`

현재 모달은 webhook URL 입력, 마스킹 표시, 테스트 전송, 저장, 알림 해제 기능을 갖추고 있다. 저장 버튼 위에 시간 드롭다운 + 요일 체크박스 섹션을 추가한다.

- [ ] **Step 1: `Settings` 인터페이스에 스케줄 필드 추가**

파일 상단의 `interface Settings`를 교체:

```typescript
interface Settings {
  webhookUrl: string | null
  lastNotifiedAt: string | null
  notifyHour: number | null
  notifyMinute: number | null
  notifyDays: string | null
}
```

- [ ] **Step 2: state 변수 추가**

`useState` 선언부 (`const [message, setMessage]` 이후)에 추가:

```typescript
const [notifyHour, setNotifyHour] = useState<number | null>(null)
const [notifyMinute, setNotifyMinute] = useState<number | null>(null)
const [notifyDaysArr, setNotifyDaysArr] = useState<number[]>([])
```

- [ ] **Step 3: `useEffect` 업데이트 — 스케줄 필드 초기값 로딩**

기존 `useEffect` 내부에서 `setSettings(data)` 이후에 스케줄 초기화 추가:

```typescript
useEffect(() => {
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
}, [])
```

- [ ] **Step 4: `handleSave` 업데이트 — 스케줄 필드를 PUT 요청에 포함**

기존 `handleSave`의 `body: JSON.stringify({ webhookUrl: inputUrl || null })` 라인을 교체:

```typescript
async function handleSave() {
  setStatus('saving')
  setMessage('')
  const daysValue = notifyDaysArr.length > 0
    ? [...notifyDaysArr].sort((a, b) => a - b).join(',')
    : null
  const res = await fetch('/api/user/notification-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhookUrl: inputUrl || null,
      notifyHour,
      notifyMinute,
      notifyDays: daysValue,
    }),
  })
  const data = await res.json()
  if (res.ok) {
    setSettings(prev => ({
      ...prev!,
      webhookUrl: inputUrl || null,
      notifyHour,
      notifyMinute,
      notifyDays: daysValue,
    }))
    setIsEditing(false)
    setStatus('success')
    setMessage('저장됐습니다.')
  } else {
    setStatus('error')
    setMessage(data.error ?? '저장 실패')
  }
}
```

- [ ] **Step 5: `handleClear` 업데이트 — 스케줄 state도 초기화**

기존 `handleClear`의 `setSettings(...)` 라인 이후에 스케줄 초기화 추가:

```typescript
async function handleClear() {
  setStatus('saving')
  const res = await fetch('/api/user/notification-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl: null }),
  })
  if (res.ok) {
    setSettings({ webhookUrl: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null })
    setInputUrl('')
    setNotifyHour(null)
    setNotifyMinute(null)
    setNotifyDaysArr([])
    setIsEditing(false)
    setStatus('idle')
    setMessage('')
  }
}
```

- [ ] **Step 6: JSX — 스케줄 섹션 추가**

`{/* Buttons */}` 바로 위에 스케줄 섹션 삽입:

```tsx
{/* Schedule — only shown when webhook is configured or being entered */}
{(isConfigured || inputUrl) && (
  <div className="mb-4 space-y-3">
    {/* Time */}
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">알림 시간</label>
      <div className="flex gap-2">
        <select
          value={notifyHour ?? ''}
          onChange={e => {
            const val = e.target.value
            if (val === '') {
              setNotifyHour(null)
              setNotifyMinute(null)
            } else {
              setNotifyHour(Number(val))
              if (notifyMinute === null) setNotifyMinute(0)
            }
          }}
          className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">없음</option>
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
          ))}
        </select>
        <select
          value={notifyMinute ?? ''}
          disabled={notifyHour === null}
          onChange={e => setNotifyMinute(Number(e.target.value))}
          className="w-24 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-40"
        >
          <option value={0}>00분</option>
          <option value={30}>30분</option>
        </select>
      </div>
    </div>

    {/* Days */}
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
        알림 요일
        <span className="ml-1.5 font-normal normal-case text-gray-400">
          {notifyDaysArr.length === 0 ? '(매일)' : ''}
        </span>
      </label>
      <div className="flex gap-1">
        {['일', '월', '화', '수', '목', '금', '토'].map((label, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setNotifyDaysArr(prev =>
                prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
              )
            }}
            className={`flex-1 text-xs py-1 rounded-md border transition-colors ${
              notifyDaysArr.includes(idx)
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음.

- [ ] **Step 8: 빌드 확인**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` 출력.

- [ ] **Step 9: 커밋**

```bash
git add src/components/NotificationSettingsModal.tsx
git commit -m "feat: add schedule time/day UI to NotificationSettingsModal"
```

---

## 최종 검증

- [ ] **`npx tsc --noEmit` 에러 없음 확인**
- [ ] **`npm run build` 성공 확인**
- [ ] **수동 동작 확인 (dev 서버):**
  1. 즐겨찾기 페이지 → "🔔 알림 설정" 클릭
  2. Webhook URL 입력 시 시간/요일 섹션 표시 확인
  3. 시간 선택 → 분 드롭다운 활성화 확인
  4. 시간 "없음" 선택 → 분 자동 null 확인
  5. 요일 전체 해제 시 "(매일)" 표시 확인
  6. 저장 → 모달 닫고 재열기 시 설정값 유지 확인
  7. "알림 해제" → 스케줄 초기화 확인
- [ ] **스케줄 크론 수동 테스트:**
  ```bash
  curl -X POST http://localhost:3000/api/cron/notify \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
  Expected: `{"notified":0}` (또는 현재 KST 시각에 맞는 사용자 수)
