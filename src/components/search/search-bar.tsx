'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

export function SearchBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const q = query.trim()
      if (q) {
        router.push(`/search?q=${encodeURIComponent(q)}`)
        setOpen(false)
        setQuery('')
      }
    },
    [query, router]
  )

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-md hover:bg-green-600 dark:hover:bg-green-800 transition-colors"
        aria-label="검색"
      >
        <SearchIcon />
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQuery('') }
        }}
        onBlur={() => { if (!query.trim()) setOpen(false) }}
        placeholder="품목 또는 시장..."
        className="w-36 sm:w-48 px-3 py-1.5 text-sm rounded-l-md bg-green-600 text-white placeholder-green-300 border border-green-500 focus:outline-none focus:border-white"
      />
      <button
        type="submit"
        className="p-1.5 bg-green-600 hover:bg-green-500 rounded-r-md border border-l-0 border-green-500 transition-colors"
        aria-label="검색 실행"
      >
        <SearchIcon className="w-4 h-4" />
      </button>
    </form>
  )
}
