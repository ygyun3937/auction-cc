'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/', label: '대시보드' },
  { href: '/products', label: '품목별 가격' },
  { href: '/markets', label: '시장별 현황' },
]

export function MobileNavMenu() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-2 rounded-md hover:bg-green-600 dark:hover:bg-green-800 transition-colors"
        aria-label="메뉴"
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute top-16 left-0 right-0 z-50 bg-green-700 dark:bg-green-900 shadow-lg border-t border-green-600 dark:border-green-800">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-3.5 text-sm font-medium border-b border-green-600/50 dark:border-green-800/50 transition-colors ${
                pathname === href
                  ? 'text-white bg-green-600 dark:bg-green-800'
                  : 'text-green-100 hover:bg-green-600 dark:hover:bg-green-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
