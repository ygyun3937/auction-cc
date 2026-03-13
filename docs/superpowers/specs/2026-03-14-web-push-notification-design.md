# Web Push 알림 — 브라우저 푸시 알림 지원

**Date:** 2026-03-14
**Status:** Draft

---

## 1. 목표

사용자가 별도 앱(Discord 등) 없이 브라우저 권한 허용만으로 즐겨찾기 품목의 최신 가격 알림을 핸드폰/PC에서 받을 수 있게 한다. Discord 알림은 선택적으로 유지되며, Web Push가 주요 알림 채널이 된다.

---

## 2. 현재 구조 (As-Is)

- Discord webhook URL 기반 알림
- `notifyFavoritesForUser(userId, saleDate?)` — 단일 사용자 Discord 알림. `discordWebhookUrl` 없으면 noop 반환.
- `notifyFavoritesIfConfigured()` — `discordWebhookUrl IS NOT NULL AND discordNotifyHour IS NULL` 사용자 대상
- 스케줄 필드: `discordNotifyHour Int?`, `discordNotifyMinute Int?`, `discordNotifyDays String?`
- 스케줄 크론 `/api/cron/notify` — `discordWebhookUrl IS NOT NULL AND discordNotifyHour IS NOT NULL` 사용자 대상

---

## 3. 변경 설계 (To-Be)

### 3.1 VAPID 키

Web Push 발송을 위한 VAPID 키를 1회 생성하여 환경변수로 저장한다:

```
VAPID_PUBLIC_KEY=<base64url>
VAPID_PRIVATE_KEY=<base64url>
VAPID_SUBJECT=mailto:admin@yourdomain.com   # 반드시 mailto: URI 또는 https:// URL 형식 (배포 전 실제 이메일로 교체 필수)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<base64url>    # 클라이언트에 노출되는 공개키 (동일 값)
```

키 생성 명령:
```bash
npx web-push generate-vapid-keys
```

### 3.2 DB 변경

**새 모델 `PushSubscription` 추가:**

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

**`User` 모델에 역관계 추가:**

```prisma
model User {
  // ... 기존 필드
  pushSubscriptions PushSubscription[]
}
```

- User 1명이 여러 행 가질 수 있음 (멀티 디바이스 지원)
- `endpoint` unique 제약으로 같은 기기 중복 구독 방지
- `onDelete: Cascade` — 사용자 삭제 시 구독도 자동 삭제
- `updatedAt` — 브라우저 키 교체(re-registration) 시각 추적

Prisma migration: `add_push_subscriptions`

**스케줄 공유:** Discord와 Web Push는 기존 `discordNotifyHour`, `discordNotifyMinute`, `discordNotifyDays` 필드를 그대로 공유한다. 별도 스케줄 필드 추가 없음.

**구독 상한:** 사용자당 구독 수 제한 없음 (저트래픽 서비스 기준, 범위 외).

### 3.3 새 라이브러리 (`src/lib/webpush.ts`)

```typescript
import webpush from 'web-push'

if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  throw new Error('VAPID env vars are not set')
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
    JSON.stringify(payload),  // sw.js가 event.data.json()으로 파싱하는 { title, body } 객체
  )
}
```

- 발송 실패 시 **무조건 throw** — `web-push` 패키지가 `WebPushError`를 throw하며 `statusCode` 프로퍼티를 포함한다
- 호출자가 항상 try/catch로 처리해야 한다 (두 명세는 모순이 아님: 라이브러리가 throw하고, 호출자인 `notifyFavoritesForUser`의 per-subscription try/catch가 잡는다)

### 3.4 `notifyFavoritesForUser` 확장

`src/collectors/auction.collector.ts`의 `notifyFavoritesForUser`를 수정한다.

**기존 구조의 문제:** 함수가 `discordWebhookUrl` 없으면 즉시 반환하므로, Web Push만 설정한 사용자는 알림을 받지 못한다.

**변경 후 구조:**

```
notifyFavoritesForUser(userId, saleDate?)
  1. 사용자 조회 (discordWebhookUrl + pushSubscriptions 함께)
  2. discordWebhookUrl 없고 pushSubscriptions도 없으면 → noop 반환
  3. 날짜 결정 (saleDate 또는 최신 날짜)
  4. 즐겨찾기 + dailyPrices 조회 → 빈 결과면 반환
  5. discordSuccess = false, pushSuccess = false
  6. Discord 발송 (discordWebhookUrl 있는 경우만)
     - 성공 시 discordSuccess = true
  7. Web Push 발송 (pushSubscriptions 있는 경우)
     - 각 구독(기기)에 per-subscription try/catch
     - 성공 시 pushSuccess = true
     - HTTP 410/404 응답 → 해당 구독 DB 삭제
         DB 삭제 실패 시 → console.error, 계속 진행
     - 기타 에러 → console.error, 계속 진행
  8. discordLastNotifiedAt 업데이트 조건:
     (discordSuccess || pushSuccess) 인 경우에만 업데이트
     try/catch로 감쌈, DB 실패 → console.error, throw 안 함
     (참고: discordLastNotifiedAt 필드명은 유지하되, Web Push 발송 성공 시에도 갱신한다. 의미는 "마지막 알림 발송 시각"으로 확장됨)
```

**만료 구독 판별:** `webpush.sendNotification`이 throw한 `WebPushError` 객체의 `statusCode` 프로퍼티(number)가 410 또는 404인 경우 해당 `PushSubscription`을 DB에서 삭제한다. (`(err as any).statusCode === 410 || (err as any).statusCode === 404` 로 판별)

**Web Push 메시지 포맷:**
```json
{
  "title": "즐겨찾기 가격 알림",
  "body": "사과 12,500원 외 3개 품목"
}
```

body 생성 규칙:
- `payload` 배열이 1개: `"${품목명} ${가격}원"` ("외 N개 품목" 생략)
- `payload` 배열이 2개 이상: `"${첫번째 품목명} ${가격}원 외 ${payload.length - 1}개 품목"`
- 가격: `Math.round(avgPrice).toLocaleString('ko-KR')`

### 3.5 `notifyFavoritesIfConfigured` + `/api/cron/notify` WHERE 조건 변경

Web Push만 설정한 사용자(Discord webhook 없음)도 알림 대상에 포함해야 한다.

**`notifyFavoritesIfConfigured` WHERE 변경:**
```prisma
// 기존
where: { discordWebhookUrl: { not: null }, discordNotifyHour: null }

// 변경
where: {
  discordNotifyHour: null,
  OR: [
    { discordWebhookUrl: { not: null } },
    { pushSubscriptions: { some: {} } },
  ],
}
```

**`/api/cron/notify` WHERE 변경:**
```prisma
// 기존
where: {
  discordWebhookUrl: { not: null },
  discordNotifyHour: { not: null },
  discordNotifyMinute: { not: null },
}

// 변경
where: {
  discordNotifyHour: { not: null },
  discordNotifyMinute: { not: null },
  OR: [
    { discordWebhookUrl: { not: null } },
    { pushSubscriptions: { some: {} } },
  ],
}
```

### 3.6 API 엔드포인트

#### `POST /api/user/push-subscription`

- 세션 인증 필수 (401 if no session)
- body: `{ endpoint: string, keys: { p256dh: string, auth: string } }`
- endpoint/p256dh/auth 모두 non-empty string 검증 → 실패 시 `400 { error: 'Invalid subscription' }`
- endpoint가 **다른 userId**에 이미 등록된 경우 → `409 { error: 'Endpoint already registered' }` 반환 (재할당 없음)
- 같은 userId의 endpoint → `upsert`: `p256dh`, `auth` 덮어씀 (`updatedAt`은 `@updatedAt`으로 자동 갱신, 명시 불필요) (브라우저 키 교체 지원)
- 응답: `{ ok: true }`

#### `DELETE /api/user/push-subscription`

- 세션 인증 필수 (401 if no session)
- body: `{ endpoint: string }` (JSON body, `Content-Type: application/json` 필수)
- 해당 endpoint가 다른 userId 소유 → `403 { error: 'Forbidden' }`
- 없는 endpoint → `200 { ok: true }` (noop)
- 응답: `{ ok: true }`

#### `GET /api/user/push-subscription`

- 세션 인증 필수
- **세션 userId로 필터링** — 전체 구독이 아닌 현재 로그인 사용자의 구독만 반환
- 응답: `{ endpoints: string[] }` (현재 사용자의 모든 구독 endpoint 목록)

### 3.7 Service Worker (`public/sw.js`)

`public/sw.js`는 Next.js 컴파일러를 거치지 않는 정적 파일이다. `process.env` 등 빌드타임 상수를 사용할 수 없음 (알려진 제한, 범위 외).

```javascript
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

### 3.8 Service Worker 등록 (`src/components/PushNotificationManager.tsx`)

Client Component. `src/app/layout.tsx`에 마운트 (SSR 없이 client-side only).

**역할: SW 등록만 담당.** 구독/해제 로직은 `NotificationSettingsModal.tsx`에서 처리한다. 두 컴포넌트가 중복 구독을 시도하지 않는다.

- `navigator.serviceWorker` 미지원 브라우저: 아무 동작 없이 종료
- SW 등록 시 기존 등록 확인 먼저: `navigator.serviceWorker.getRegistration('/sw.js')`로 이미 등록된 SW가 있으면 `register` 호출 생략 (재등록 불필요)
- `navigator.serviceWorker.register('/sw.js')` 실패 시: `console.error` 기록, UI에 영향 없음 (모달에서 알림 버튼 미표시)

### 3.9 UI — `NotificationSettingsModal.tsx` 확장

**웹 푸시 알림 섹션** (기존 Discord URL 섹션 위에 추가):

**상태 로딩 (모달 열릴 때):**
1. `GET /api/user/push-subscription` → 서버의 `endpoints[]` 배열 조회
2. `registration.pushManager.getSubscription()` → 현재 기기의 구독 객체 조회
3. 현재 기기 endpoint가 서버 `endpoints[]`에 포함 여부 → `isSubscribed` 상태

**표시 조건:**
- `typeof Notification === 'undefined'` 또는 Service Worker 미지원 → 섹션 미표시

**미구독 상태:**
- "이 기기에서 알림 받기" 버튼
- 클릭 → `Notification.requestPermission()`
  - 허용: `applicationServerKey`는 base64url 문자열을 `Uint8Array`로 변환 후 전달 필요 (브라우저 API 요구사항). `urlBase64ToUint8Array` 헬퍼 함수를 컴포넌트 내부에 정의한다:
    ```ts
    function urlBase64ToUint8Array(base64String: string) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
      const rawData = atob(base64)
      return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
    }
    ```
    `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) })` → `POST /api/user/push-subscription` → `isSubscribed = true`
  - 거부: "브라우저 설정에서 알림을 허용해주세요" 메시지 표시

**구독 중 상태:**
- "이 기기에서 구독 중 (N개 기기)" 텍스트 (N = 서버 `endpoints[]` 길이; 만료된 구독이 자동 정리되기 전까지 실제 활성 기기 수보다 클 수 있음 — 허용된 동작)
- "구독 해제" 버튼 → `registration.pushManager.unsubscribe()` → `DELETE /api/user/push-subscription` → `isSubscribed = false`

**스케줄 설정:** 기존 시간/요일 UI 공유 (변경 없음).

---

## 4. 데이터 흐름

수집 크론 (스케줄 미설정 사용자):
```
[Cron: 0 1 * * *] → notifyFavoritesIfConfigured()
  WHERE discordNotifyHour IS NULL
    AND (discordWebhookUrl IS NOT NULL OR pushSubscriptions.some)
  → per-user: notifyFavoritesForUser(userId, date)
      ├─ Discord 발송 (있는 경우)
      └─ Web Push 발송 (구독 있는 경우, per-subscription try/catch)
          └─ 410/404 → 만료 구독 DB 삭제
```

스케줄 크론 (스케줄 설정 사용자):
```
[Cron: */30 * * * *] → /api/cron/notify
  WHERE discordNotifyHour IS NOT NULL AND discordNotifyMinute IS NOT NULL
    AND (discordWebhookUrl IS NOT NULL OR pushSubscriptions.some)
  → 시각/요일 필터
  → per-user: notifyFavoritesForUser(userId)
      ├─ Discord 발송 (있는 경우)
      └─ Web Push 발송 (구독 있는 경우)
```

---

## 5. 보안 고려사항

- VAPID_PRIVATE_KEY는 서버 환경변수만 저장, 소스코드 포함 금지
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`만 클라이언트에 노출 (공개키)
- 구독 저장/삭제: 세션 userId 기반
- 타인 endpoint POST → 409; DELETE → 403

---

## 6. 범위 외

- Safari 16 이하 (iOS 16 이하)
- PWA manifest / 홈 화면 추가
- 기기별 이름 표시 UI
- 알림 클릭 시 특정 품목 페이지 이동
- 사용자당 구독 수 상한
- Service Worker 빌드타임 환경변수 주입
