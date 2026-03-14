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
