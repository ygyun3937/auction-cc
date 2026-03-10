import Link from 'next/link'
import { SearchBar } from '@/components/search/search-bar'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { AuthButton } from '@/components/layout/auth-button'

export function Header() {
  return (
    <header className="bg-green-700 dark:bg-green-900 text-white shadow-md">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🌾</span>
            <span className="font-bold text-lg hidden sm:block">전국 농수산물 경매 모니터링</span>
            <span className="font-bold text-lg sm:hidden">경매 모니터링</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="hover:text-green-200 transition-colors">대시보드</Link>
            <Link href="/products" className="hover:text-green-200 transition-colors">품목별 가격</Link>
            <Link href="/markets" className="hover:text-green-200 transition-colors">시장별 현황</Link>
          </nav>
          <div className="flex items-center gap-2">
            <div className="w-48 sm:w-64">
              <SearchBar />
            </div>
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  )
}
