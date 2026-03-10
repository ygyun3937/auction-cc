# Google OAuth 설정 가이드

이 가이드는 auction-monitor 프로젝트에 Google OAuth 로그인을 설정하는 전체 과정을 설명합니다.

---

## 1. 사전 준비

### 필요한 패키지

```bash
npm install next-auth@beta @auth/prisma-adapter
```

### 환경 요구 사항

- Next.js 15+ (App Router)
- PostgreSQL (Prisma ORM)
- Google Cloud 계정

---

## 2. Prisma 스키마 설정

`prisma/schema.prisma`에 Auth.js v5용 모델 추가:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  accounts      Account[]
  sessions      Session[]
  favorites     Favorite[]
  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime
  @@unique([identifier, token])
  @@map("verification_tokens")
}

model Favorite {
  id          Int      @id @default(autoincrement())
  userId      String
  productCode String
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, productCode])
  @@index([userId])
  @@map("favorites")
}
```

마이그레이션 실행:

```bash
npx prisma migrate dev --name add_auth_and_favorites
```

---

## 3. Auth.js 설정

### 3-1. `auth.ts` (프로젝트 루트)

```ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
  pages: { signIn: '/api/auth/signin' },
})
```

### 3-2. `src/app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from '@/../auth'
export const { GET, POST } = handlers
```

---

## 4. Google Cloud Console 설정

### 4-1. 프로젝트 및 OAuth 앱 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **APIs & Services → OAuth consent screen** 설정
   - User Type: External
   - 앱 이름, 지원 이메일 입력
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** 클릭
   - Application type: **Web application**
   - Name: `auction-monitor` (원하는 이름)

### 4-2. 승인된 URI 설정

**승인된 JavaScript 원본 (Authorized JavaScript origins):**

```
http://localhost:3000
https://your-domain.com
```

**승인된 리디렉션 URI (Authorized redirect URIs):**

```
http://localhost:3000/api/auth/callback/google
https://your-domain.com/api/auth/callback/google
```

> ngrok 같은 터널링 도구 사용 시 해당 도메인도 추가

### 4-3. 크레덴셜 확인

생성 후 **Client ID**와 **Client Secret**을 복사해둡니다.

---

## 5. 환경 변수 설정

`.env.local`:

```env
# Auth.js
AUTH_URL="https://your-domain.com"   # 실제 서비스 도메인 (ngrok 등 사용 시)
AUTH_SECRET="랜덤한-시크릿-키"        # openssl rand -base64 32 로 생성
AUTH_GOOGLE_ID="your-client-id.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-your-client-secret"
```

> `AUTH_URL`은 ngrok이나 실제 도메인으로 접속할 때만 필요합니다. localhost만 사용할 경우 생략 가능합니다.

**AUTH_SECRET 생성:**

```bash
openssl rand -base64 32
```

---

## 6. Next.js 이미지 도메인 설정

구글 프로필 이미지 사용을 위해 `next.config.ts`에 추가:

```ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
}
```

---

## 7. SessionProvider 설정

`src/components/providers.tsx`에 `SessionProvider` 추가:

```tsx
'use client'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* 기존 providers */}
      {children}
    </SessionProvider>
  )
}
```

---

## 8. ngrok으로 로컬 HTTPS 테스트

```bash
# ngrok 설치 후
ngrok http 3000
```

ngrok URL을 `.env.local`의 `AUTH_URL`에 설정하고,
Google Cloud Console에도 해당 URL을 위 4-2 단계에서 추가합니다.

> Google Cloud Console 설정 변경 후 적용까지 최대 수 분이 걸릴 수 있습니다.

---

## 9. 즐겨찾기 API

### GET `/api/favorites`
로그인한 사용자의 즐겨찾기 목록(productCode 배열) 반환

### POST `/api/favorites`
```json
{ "productCode": "1234" }
```

### DELETE `/api/favorites/:code`
즐겨찾기 삭제

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `redirect_uri_mismatch` 오류 | Google Console에 콜백 URI 미등록 | 4-2 단계에서 URI 추가 후 저장 |
| 프로필 이미지 로드 실패 | `next.config.ts` 도메인 미설정 | `lh3.googleusercontent.com` 추가 |
| 로그인 후 세션 없음 | `AUTH_SECRET` 미설정 | `.env.local`에 추가 |
| ngrok으로 접속 시 로그인 실패 | `AUTH_URL` 미설정 | `.env.local`에 ngrok URL 추가 |
