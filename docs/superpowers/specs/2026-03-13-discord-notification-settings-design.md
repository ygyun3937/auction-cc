# Discord 알림 설정 — 사용자별 Webhook 구성

**Date:** 2026-03-13
**Status:** Approved

---

## 1. 목표

사용자가 사이트에서 자신의 Discord Webhook URL을 직접 입력하고, 즐겨찾기 품목의 가격 정보를 개인 Discord 채널로 수신할 수 있게 한다.

---

## 2. 현재 구조 (As-Is)

- 서버 환경변수 `DISCORD_WEBHOOK_URL` 하나로 전체 즐겨찾기를 단일 webhook에 전송
- 크론 수집(`collectAuctionData`) 완료 후 `notifyFavoritesIfConfigured` 호출
- 모든 사용자의 즐겨찾기를 중복 제거 후 하나의 embed 배치로 전송

---

## 3. 변경 설계 (To-Be)

### 3.1 DB 변경

`User` 모델에 필드 2개 추가:

```prisma
model User {
  // ... 기존 필드
  discordWebhookUrl      String?
  discordLastNotifiedAt  DateTime?
}
```

Prisma migration: `add_discord_fields_to_users`

`discordLastNotifiedAt`는 사용자 webhook으로 알림이 성공적으로 전송될 때마다 업데이트된다.

### 3.2 API

공통 에러 응답 형식: `{ error: string }` (기존 favorites API 컨벤션과 동일)

#### `GET /api/user/notification-settings`
- 세션 없으면 `401 { error: 'Unauthorized' }`
- 응답: `{ webhookUrl: string | null, lastNotifiedAt: string | null }`
- `webhookUrl`은 실제 URL 그대로 반환 (본인만 조회 가능). 클라이언트에서 표시 시 마스킹 처리.

#### `PUT /api/user/notification-settings`
- 세션 없으면 `401 { error: 'Unauthorized' }`
- Body: `{ webhookUrl: string | null }`
- `webhookUrl`이 `null` 또는 `""(빈 문자열)`이면 형식 검증 없이 DB에 `null`로 저장 (알림 해제)
- 비어있지 않은 경우 형식 검증: `^https://discord\.com/api/webhooks/\d+/[\w.\-]+$` 정규식 (토큰에 `.` 포함 허용)
  - 검증 실패 시 `400 { error: 'Invalid webhook URL format' }`
- 저장 성공 시 `200 { ok: true }`

#### `POST /api/user/notification-settings/test`
- 세션 없으면 `401 { error: 'Unauthorized' }`
- DB에 저장된 현재 사용자의 `discordWebhookUrl`로 테스트 메시지 전송
- `discordWebhookUrl`이 null이면 `400 { error: 'No webhook URL configured' }`
- 테스트 메시지 내용: "✅ 연결 테스트 성공! 경매 모니터에서 즐겨찾기 알림이 이 채널로 전송됩니다." 텍스트를 Discord embed로 전송
- Discord API 오류 시 `502 { error: 'Discord webhook request failed' }`
- 성공 시 `200 { ok: true }`
- **Rate limiting 정책:** 이 엔드포인트는 별도 rate limiting 미적용. Discord 기본 webhook 제한(30req/min)에 의해 자연 제한됨. 사용자 수가 작은 서비스이므로 현재는 충분하다.

### 3.3 UI

**위치:** `src/app/favorites/page.tsx` 헤더 우측

**버튼:** `🔔 알림 설정` (favorites page에 Client Component 분리 필요)

**컴포넌트:** `src/components/NotificationSettingsModal.tsx` 신규 생성 (Client Component)

**모달 동작:**
1. 열릴 때 `GET /api/user/notification-settings` 호출해 현재 상태 로드
2. **미설정 상태:** URL 입력 필드 + "저장" 버튼
3. **설정됨 상태:**
   - 마스킹된 URL 표시 (클라이언트에서 `https://discord.com/api/webhooks/****/****` 형태로 마스킹). 수정 버튼 클릭 시 입력 필드를 `GET` 응답의 실제 `webhookUrl` 값으로 pre-fill한 후 편집 가능 상태로 전환
   - `discordLastNotifiedAt`이 있으면 "마지막 전송: YYYY-MM-DD" 표시 (KST 기준으로 포맷)
   - "테스트 전송" + "저장" + "알림 해제" 버튼
4. "테스트 전송" 클릭 → `POST .../test` → 인라인 성공/실패 메시지
5. "알림 해제" 클릭 → `PUT` with `{ webhookUrl: null }` → 미설정 상태로 전환

### 3.4 알림 로직 변경

#### `src/lib/discord.ts`

`notifyFavoritesPrices` 시그니처 변경:
```typescript
// 기존: webhookUrl을 process.env에서 읽음
export async function notifyFavoritesPrices(products: FavoriteProductPrice[])

// 변경: webhookUrl을 파라미터로 받음
export async function notifyFavoritesPrices(products: FavoriteProductPrice[], webhookUrl: string)
```

`sendWebhook` 내부 함수도 `webhookUrl` 파라미터를 받도록 수정. `process.env.DISCORD_WEBHOOK_URL` 참조 완전 제거.

`sendWebhook`은 Discord API 응답이 non-2xx인 경우 `Error`를 throw해야 한다. 이를 통해 테스트 엔드포인트에서 catch 후 502 반환이 가능하다.

`notifyFavoritesPrices` 내부에서 각 청크를 개별 try/catch로 처리한다. 성공한 청크 수를 추적하여, 성공한 청크가 하나라도 있으면 정상 반환한다. 모든 청크가 throw한 경우에만 `Error`를 throw한다.

#### `src/collectors/auction.collector.ts`

`notifyFavoritesIfConfigured(saleDate)` 로직 전면 교체:

```
1. discordWebhookUrl이 null이 아닌 사용자 목록 조회 (User 테이블)
2. 사용자가 없으면 즉시 반환
3. 각 사용자에 대해 순차 처리:
   a. 해당 사용자의 즐겨찾기 productCode 목록 조회
   b. 즐겨찾기가 없으면 다음 사용자로 건너뜀
   c. 해당 날짜의 dailyPrice 조회
   d. 가격 데이터가 없으면 다음 사용자로 건너뜀 (조용히 스킵, 오류 없음)
   e. notifyFavoritesPrices(payload, user.discordWebhookUrl) 호출
   f. 성공 시 해당 User의 discordLastNotifiedAt을 현재 시각으로 업데이트
      - "성공"의 정의: notifyFavoritesPrices가 throw 없이 완료된 경우 (청크 일부 실패 포함). 단 모든 청크가 throw한 경우에는 업데이트 안 함
4. 개별 사용자 전송 실패는 console.error 후 다음 사용자 처리 계속 (전체 실패로 전파 안 함)
```

순차 처리 이유: 소규모 서비스이므로 병렬 처리 불필요, Discord rate limit 안전

글로벌 `DISCORD_WEBHOOK_URL` 환경변수는 더 이상 사용하지 않음.

### 3.5 `scripts/notify-favorites.ts` 업데이트

`notifyFavoritesIfConfigured` 함수를 `auction.collector.ts`에서 export하여 스크립트에서 재사용:

```typescript
// scripts/notify-favorites.ts
import { notifyFavoritesIfConfigured } from '../src/collectors/auction.collector'

const targetDate = process.argv[2] // optional: YYYY-MM-DD

// saleDate 미지정 시: notifyFavoritesIfConfigured 내부에서 dailyPrice 최신 날짜를 조회
// saleDate 지정 시: 해당 날짜로 전송
await notifyFavoritesIfConfigured(targetDate) // targetDate는 undefined 가능
```

`notifyFavoritesIfConfigured(saleDate?: string)` 시그니처:
- `saleDate`가 undefined이면 함수 내부에서 `dailyPrice` 테이블의 최신 날짜를 조회해 사용
- `saleDate`가 지정되면 그 날짜로 조회

로직 중복 없음. 현재 스크립트의 "최신 날짜 fallback" 로직이 함수 내부로 이동.

---

## 4. 보안 고려사항

- Webhook URL은 본인만 조회/수정 가능 (세션 userId 기반)
- URL 형식 검증으로 비Discord URL 차단 (정규식: `^https://discord\.com/api/webhooks/\d+/[\w.\-]+$`)
- 테스트 전송은 DB에 저장된 URL만 사용 (임의 URL로 전송 불가)
- 빈 문자열/null은 validation 없이 null로 처리 (알림 해제 경로 명확화)

---

## 5. 범위 외

- 알림 시간대 설정
- 알림 조건 설정 (가격 변동률 임계값 등)
- 이메일 알림
- 테스트 엔드포인트 rate limiting (서비스 규모 고려 시 현재 불필요)
