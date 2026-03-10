'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'

interface Props {
  productCode: string
  productName: string
}

export function FavoriteButton({ productCode, productName }: Props) {
  const { data: session } = useSession()
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session) return
    fetch('/api/favorites')
      .then(r => r.json())
      .then((codes: string[]) => setIsFavorite(codes.includes(productCode)))
      .catch(() => {})
  }, [session, productCode])

  async function toggle() {
    if (!session) {
      signIn('google')
      return
    }
    setLoading(true)
    try {
      if (isFavorite) {
        await fetch(`/api/favorites/${productCode}`, { method: 'DELETE' })
        setIsFavorite(false)
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productCode }),
        })
        setIsFavorite(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={isFavorite ? `${productName} 즐겨찾기 해제` : `${productName} 즐겨찾기 추가`}
      className={`p-2 rounded-full transition-colors ${
        isFavorite
          ? 'text-yellow-500 hover:text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
          : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <svg
        className="w-6 h-6"
        fill={isFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
    </button>
  )
}
