'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export function SearchBar() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      }
    },
    [query, router]
  )

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="품목 또는 시장 검색..."
        className="flex-1 px-3 py-1.5 text-sm rounded-md bg-green-600 text-white placeholder-green-300 border border-green-500 focus:outline-none focus:border-white"
      />
      <button
        type="submit"
        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded-md border border-green-500 transition-colors"
      >
        검색
      </button>
    </form>
  )
}
