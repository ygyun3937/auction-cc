# 알림 스케줄 설정 — 사용자별 시간/요일 지정

**Date:** 2026-03-13
**Status:** Approved

---

## 1. 목표

사용자가 데이터 수집 크론과 별개로, 원하는 시간과 요일에 즐겨찾기 품목의 최신 가격 알림을 Discord로 받을 수 있게 한다.

---

## 2. 현재 구조 (As-Is)

- 알림은 데이터 수집 크론(`0 1 * * *` UTC = KST 10:00) 완료 후에만 발송
- `notifyFavoritesIfConfigured(saleDate?)` in `src/collectors/auction.collector.ts` — `discordWebhookUrl IS NOT NULL` 사용자 전체에게 순차 발송
- `notifyFavoritesPrices(products, webhookUrl)` in `src/lib/discord.ts` — 청크별 embed 전송, 모든 청크 실패 시에만 throw

---

## 3. 변경 설계 (To-Be)

### 3.1 DB 변경

`User` 모델에 nullable 필드 3개 추가 (default 없음, 기존 행 영향 없음):

```prisma
model User {
  // ... 기존 필드
  discordNotifyHour   Int?     // 0-23 (KST 기준)
  discordNotifyMinute Int?     // 0 또는 30만 허용
  discordNotifyDays   String?  // 쉼표 구분 요일 번호 (0=일, 1=월, ..., 6=토), 오름차순 정렬
                               // null = 매일 발송 (요일 제한 없음)
}
```

Prisma migration: `add_discord_notify_schedule_to_users` — additive only (nullable, no default).

### 3.2 수집 크론과의 관계 (중복 방지)

`notifyFavoritesIfConfigured()`와 `notifyFavoritesForUser` 리팩토링은 **동일 커밋에서 함께 적용**해야 한다. 두 변경이 분리되면 일시적으로 잘못된 동작이 발생한다.

`notifyFavoritesIfConfigured()`의 Prisma WHERE 조건을 변경:

```
기존: discordWebhookUrl IS NOT NULL
변경: discordWebhookUrl IS NOT NULL AND discordNotifyHour IS NULL
```

- 스케줄 미설정 사용자: 수집 크론 완료 시 발송 (기존 동작 유지)
- 스케줄 설정 사용자: 수집 크론 알림 없음, 스케줄 크론에서만 발송

**알려진 제한사항:** KST 10:00으로 스케줄을 설정한 사용자는 수집 크론 완료 전 스케줄 크론이 실행되면 전날 데이터를 받을 수 있다. 허용된 동작.

### 3.3 새 내부 함수 (`src/collectors/auction.collector.ts`)

```typescript
export async function notifyFavoritesForUser(
  userId: string,
  saleDate?: string
): Promise<void>
```

**동작:**
1. userId로 사용자 조회 → `discordWebhookUrl`이 없으면 noop 반환
2. `saleDate` 미지정 시 DB에서 최신 날짜 자동 조회
3. 즐겨찾기 조회 → `notifyFavoritesPrices(products, webhookUrl)` 호출
4. Discord 발송 성공(정상 반환) 시: `discordLastNotifiedAt` 업데이트를 try/catch로 감싸 실행. DB 업데이트 실패는 `console.error`로 기록하되 throw하지 않음.
5. `notifyFavoritesPrices` throw 시 (모든 청크 실패): re-throw (함수 호출자가 catch)

따라서 **함수가 throw하는 경우**: Discord 발송이 완전 실패한 경우 + 사용자 조회 쿼리 실패. `discordLastNotifiedAt` 업데이트 실패는 throw하지 않는다.

부분 청크 실패(partial failure): `notifyFavoritesPrices` 기존 동작대로 throw 없이 통과 (허용된 동작).

사용자 삭제(계정 미존재) 등 예외는 함수 내부 쿼리 단계에서 throw되며 호출자 catch가 처리한다. 별도 가드 없음 (허용된 엣지 케이스).

**DRY:** `notifyFavoritesIfConfigured()`는 per-user 인라인 로직 대신 `notifyFavoritesForUser(user.id, saleDate)`를 호출하도록 리팩토링.

### 3.4 API 엔드포인트 확장

`/api/user/notification-settings` GET/PUT 확장 (별도 라우트 생성 없음):

#### GET 응답

```json
{
  "webhookUrl": "string | null",
  "lastNotifiedAt": "string | null",
  "notifyHour": "number | null",
  "notifyMinute": "number | null",
  "notifyDays": "string | null"
}
```

`lastNotifiedAt`(`discordLastNotifiedAt`)은 수집 크론과 스케줄 크론 발송 시 모두 업데이트됨. 두 경로 구분 없이 마지막 발송 시각 표시.

#### PUT 요청 바디

```json
{
  "webhookUrl": "string | null",
  "notifyHour": "number | null",
  "notifyMinute": "number | null",
  "notifyDays": "string | null"
}
```

**PUT 처리 순서:**

1. `webhookUrl`이 null/빈 문자열이면 **즉시 cascade 처리** — 다음 4개 필드를 모두 null로 저장하고 스케줄 유효성 검사를 건너뜀:
   - `discordWebhookUrl`
   - `discordNotifyHour`
   - `discordNotifyMinute`
   - `discordNotifyDays`

2. `webhookUrl`이 있는 경우에만 스케줄 필드 유효성 검사 진행:
   - `notifyDays` 빈 문자열(`""`) → **먼저 null로 정규화**한 뒤 이후 검사 수행
   - `notifyHour`: 0~23 정수 (typeof === 'number' && Number.isInteger() 확인; 소수점/비정수 → 400, null 허용)
   - `notifyMinute`: 0 또는 30 (null 허용)
   - `notifyHour`/`notifyMinute` 중 하나만 null → 400
   - `notifyDays`: 정확히 단일 자리 `"0"`~`"6"` 쉼표 구분. 앞뒤 공백, 선행 0, 범위 외, 중복 → 400. null 허용.
   - 서버가 저장 전 `notifyDays` 오름차순 정렬 정규화 (예: `"2,0,1"` → `"0,1,2"`)
   - 모든 validation 에러: `400 { error: 'Invalid schedule settings' }`

### 3.5 새 Vercel 크론 + API 엔드포인트

#### `vercel.json` 수정

```json
{
  "crons": [
    { "path": "/api/cron/collect", "schedule": "0 1 * * *" },
    { "path": "/api/cron/collect-grades", "schedule": "0 18,19,20,21,22,23 * * 1-6" },
    { "path": "/api/cron/notify", "schedule": "*/30 * * * *" }
  ]
}
```

#### `POST /api/cron/notify`

파일: `src/app/api/cron/notify/route.ts`, `export async function POST(...)`.
기존 크론 라우트(`/api/cron/collect`)와 동일한 POST 핸들러 패턴 사용.

**로직:**
- `CRON_SECRET` Bearer 인증 필수
- KST 시각 계산:
  ```typescript
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const hour = kstNow.getUTCHours()        // 0-23
  const minute = kstNow.getUTCMinutes()    // 0-59, 정수 반환 (floor)
  const dayOfWeek = kstNow.getUTCDay()     // 0=일 ~ 6=토
  ```
- 분 매칭: `user.discordNotifyMinute === minute` **엄격한 동등 비교** (±1 여유 없음). Vercel 크론 지연으로 minute이 0/30이 아닌 경우 해당 회차 발송 건너뜀 — 허용된 동작.
- 사용자 조회: `discordWebhookUrl IS NOT NULL AND discordNotifyHour IS NOT NULL AND discordNotifyMinute IS NOT NULL`
- 필터: `user.discordNotifyHour === hour && user.discordNotifyMinute === minute`
- `notifyDays !== null` → `dayOfWeek.toString()`이 `notifyDays.split(',')` 배열에 포함 시만 발송
- `notifyDays === null` → 요일 제한 없음
- per-user: `notifyFavoritesForUser(user.id)` 순차, try/catch
- 성공 카운트: `notifyFavoritesForUser` 정상 반환 시 카운트 증가 (Discord 발송 성공 기준; `discordLastNotifiedAt` DB 업데이트는 함수 내부에서 자체 처리되어 throw하지 않으므로 카운트에 영향 없음)
- 개별 실패 시 `console.error`, 계속 진행
- 응답: `{ notified: number }`

### 3.6 UI — 모달 확장

**TypeScript 인터페이스 확장:**
```typescript
interface Settings {
  webhookUrl: string | null
  lastNotifiedAt: string | null
  notifyHour: number | null
  notifyMinute: number | null
  notifyDays: string | null
}
```

기존 `useEffect`의 `fetch(...).then((data: Settings) => ...)` 타입 캐스팅도 이 인터페이스와 동기화.

**섹션: 알림 시간** (저장 버튼 위에 추가)
- 시간 드롭다운: "없음" + 00~23시
- 분 드롭다운: 00분/30분 (시간 선택 시만 활성화)
- 시간 "없음" 선택 → 분 자동 null

**섹션: 알림 요일**
- 체크박스 7개: 일 월 화 수 목 금 토
- 내부 상태: 선택된 요일 번호 배열 (`number[]`)
- 모두 해제 = null (매일 발송)
- PUT 전송 시: 배열 → 오름차순 정렬 후 쉼표 구분 문자열로 직렬화, 빈 배열 → `null` 전송
- 선택 없음 → "매일" 텍스트 표시

**저장 동작:**
- webhookUrl + notifyHour/notifyMinute/notifyDays 모두 PUT 요청에 포함
- webhookUrl 없으면 스케줄 UI 비활성화 (클라이언트 검증)

**초기값 로딩:**
- GET 응답의 notifyHour/notifyMinute/notifyDays로 UI 상태 초기화
- `notifyDays` 문자열 → `split(',').map(Number)` 배열로 변환해 체크박스 상태 초기화 (null이면 빈 배열)

**알림 해제(handleClear):**
- `{ webhookUrl: null }` 만 전송 (스케줄 필드 미포함)
- 서버 cascade로 4개 필드 자동 null 처리

---

## 4. 데이터 흐름

```
[Cron: 0 1 * * *] → POST /api/cron/collect → 데이터 수집
→ notifyFavoritesIfConfigured()
  WHERE discordWebhookUrl IS NOT NULL AND discordNotifyHour IS NULL
  → per-user: notifyFavoritesForUser(userId, saleDate)
  → Discord 발송 → discordLastNotifiedAt 업데이트

[Cron: */30 * * * *] → POST /api/cron/notify
→ KST 시각 계산 (hour, minute, dayOfWeek)
→ 사용자 조회 (webhook + schedule 설정됨)
→ 시각/요일 필터 (엄격한 동등 비교)
→ per-user: notifyFavoritesForUser(userId)
→ Discord 발송 → discordLastNotifiedAt 업데이트
→ { notified: N }
```

---

## 5. 보안 고려사항

- `/api/cron/notify`: `CRON_SECRET` Bearer 인증 필수
- 스케줄 설정: 본인만 조회/수정 (세션 userId 기반)
- `notifyDays`: 범위 외 값/중복/앞뒤공백/선행0 → 400 거부

---

## 6. 범위 외

- 분 단위 30분 외 세분화
- 타임존 설정 (KST 고정)
- 알림 조건 설정 (가격 변동률 등)
- 분산 락 처리
- Vercel 크론 지연 시 재시도
- 수집 크론/스케줄 크론 동시 실행 시 데이터 freshness 보장
