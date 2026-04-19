# 전국 농수산물 경매 모니터링

전국 공영도매시장 실시간 경매 데이터 기반의 농수산물 도매가 모니터링 서비스

**Live → https://farm.dooyg.store**

---

## 기술 스택

| 분류 | 기술 |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | Auth.js v5 (Google OAuth) |
| Map | Leaflet + CartoDB Dark Matter |
| Infra | Docker Compose (로컬), Vercel (프로덕션) |
| Data | 공공데이터포털 API, KAMIS API |

---

## 주요 기능

- **대시보드** — 전국 품목별 도매가, 급등/급락 TOP, 수집 통계 요약
- **품목별 가격** — 트리맵 + 테이블, 카테고리 필터, 7일 가격 변화율
- **품목 상세** — 30일 가격 추이 차트, 등급별/품종별/산지별 가격 분포
- **시장별 현황** — 지도 기반 전국 도매시장 탐색, 시장별 품목 가격 비교
- **즐겨찾기** — 관심 품목 저장 및 즐겨찾기 탭 필터
- **알림** — Discord Webhook, Web Push (VAPID) 가격 알림
- **제철 뱃지** — 월별 제철 품목 자동 표시
- **휴장일 표시** — 경매 휴장일(주말/공휴일) 자동 감지 및 마지막 거래일 기준 데이터 표시
- **검색** — 품목명 실시간 검색

---

## 아키텍처

```mermaid
flowchart TD
    subgraph Client
        Browser["브라우저"]
    end

    subgraph Next.js["Next.js App (Vercel)"]
        AppRouter["App Router\n(SSR Pages)"]
        API["API Routes\n/api/v1/*"]
        Cron["Cron Routes\n/api/cron/*"]
    end

    subgraph Services
        PriceService["price.service"]
        ProductService["product.service"]
        MarketService["market.service"]
        Collector["auction.collector\ngrade.collector"]
    end

    subgraph Storage
        PG["PostgreSQL 16"]
        Redis["Redis 7\n(캐시)"]
    end

    subgraph External
        PublicAPI["공공데이터포털 API\n전국 공영도매시장 경매정보"]
        KAMIS["KAMIS API\n농산물 유통정보"]
        Discord["Discord Webhook"]
        WebPush["Web Push (VAPID)"]
    end

    Browser --> AppRouter
    Browser --> API
    AppRouter --> Services
    API --> Services
    Cron --> Collector
    Services --> PG
    Services --> Redis
    Collector --> PublicAPI
    Collector --> KAMIS
    Collector --> PG
    Collector --> Discord
    Collector --> WebPush
```

---

## 데이터베이스 스키마

```mermaid
erDiagram
    ProductCategory ||--o{ Product : has
    Product ||--o{ AuctionPrice : has
    Product ||--o{ DailyPrice : has
    Product ||--o{ GradeDailyPrice : has
    Product ||--o{ VarietyDailyPrice : has
    Product ||--o{ OriginDailyPrice : has
    Market ||--o{ AuctionPrice : has
    User ||--o{ Favorite : has
    User ||--o{ PushSubscription : has
    User ||--o{ Account : has

    ProductCategory {
        string code PK
        string name
    }
    Product {
        string code PK
        string name
        string unit
        int unitQty
    }
    Market {
        string code PK
        string name
        string region
    }
    AuctionPrice {
        int id PK
        date auctionDate
        string grade
        decimal avgPrice
        decimal minPrice
        decimal maxPrice
        decimal volume
    }
    DailyPrice {
        int id PK
        date priceDate
        decimal avgPrice
        decimal minPrice
        decimal maxPrice
        decimal totalVolume
        decimal changeRate
        int excludedMarkets
    }
    GradeDailyPrice {
        int id PK
        date priceDate
        string gradeCode
        string gradeName
        decimal avgPrice
    }
    VarietyDailyPrice {
        int id PK
        date priceDate
        string varietyCode
        string varietyName
        decimal avgPrice
    }
    OriginDailyPrice {
        int id PK
        date priceDate
        string originName
        decimal avgPrice
    }
    User {
        string id PK
        string email
        string discordWebhookUrl
    }
    Favorite {
        int id PK
        string userId FK
        string productCode
    }
```

---

## 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx                  # 대시보드
│   ├── products/                 # 품목별 가격 / 품목 상세
│   ├── markets/                  # 시장별 현황 / 지도
│   ├── favorites/                # 즐겨찾기
│   ├── search/                   # 검색
│   └── api/
│       ├── v1/                   # REST API (prices, products, markets)
│       ├── cron/                 # 수집 크론 (collect, notify)
│       ├── favorites/            # 즐겨찾기 CRUD
│       └── auth/                 # Auth.js + Discord OAuth
├── components/
│   ├── dashboard/                # 대시보드 컴포넌트
│   ├── products/                 # 트리맵, 테이블
│   └── markets/                  # 지도 컴포넌트
├── services/
│   ├── price.service.ts          # 가격 조회 로직
│   ├── product.service.ts        # 품목 조회
│   └── market.service.ts         # 시장 조회
├── collectors/
│   ├── auction.collector.ts      # 경매 데이터 수집 + IQR 이상치 필터링
│   └── grade.collector.ts        # 등급별/산지별 데이터 수집
└── lib/
    ├── api-client.ts             # 공공 API 클라이언트
    ├── db.ts                     # Prisma 클라이언트
    ├── redis.ts                  # Redis 캐시
    ├── seasonal.ts               # 제철 품목 정의
    ├── discord.ts                # Discord 알림
    └── webpush.ts                # Web Push 알림
```

---

## 로컬 실행

### 사전 준비

- Node.js 20+
- Docker Desktop

### 환경 설정

```bash
# .env.local 생성 후 아래 변수 설정
DATABASE_URL="postgresql://auction:auction_dev_pw@localhost:5432/auction_monitor?schema=public"
REDIS_URL="redis://localhost:6379"
PUBLIC_DATA_API_KEY="..."   # 공공데이터포털 API 키
KAMIS_API_KEY="..."         # KAMIS API 키
AUTH_SECRET="..."
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
```

### 실행

```bash
# DB + Redis 실행
docker compose up -d

# 의존성 설치
npm install

# DB 마이그레이션 + 시드
npx prisma migrate deploy
npm run db:seed

# 개발 서버
npm run dev
```

---

## 데이터 수집 흐름

```mermaid
sequenceDiagram
    participant Cron as Cron (/api/cron/collect)
    participant Collector as auction.collector
    participant API as 공공데이터포털 API
    participant DB as PostgreSQL

    Cron->>Collector: collectAuctionData(date)
    Collector->>Collector: Redis 분산 락 획득
    Collector->>API: fetchAuctionData(date, page...)
    API-->>Collector: KatRealTimeItem[]
    Collector->>DB: upsertMarketsAndProducts()
    Collector->>DB: upsertAggregatedPrices() + IQR 필터링
    Collector->>DB: updateDailyAggregates()
    Collector->>DB: updateVarietyDailyPrices()
    Collector->>DB: updateOriginDailyPrices()
    Collector->>Collector: Redis 캐시 무효화
    Collector->>Collector: Discord/WebPush 알림 전송
```

---

## 환경 변수 목록

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `REDIS_URL` | Redis 연결 URL |
| `PUBLIC_DATA_API_KEY` | 공공데이터포털 API 키 |
| `KAMIS_API_KEY` / `KAMIS_API_ID` | KAMIS 농산물유통정보 API |
| `CRON_SECRET` | 크론 엔드포인트 인증 시크릿 |
| `AUTH_SECRET` | Auth.js 시크릿 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 앱 키 |
| `DISCORD_WEBHOOK_URL` | Discord 알림 Webhook |
| `DISCORD_BOT_TOKEN` | Discord Bot 토큰 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push VAPID 키 |
