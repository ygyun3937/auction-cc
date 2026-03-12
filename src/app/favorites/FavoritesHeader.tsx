'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const NotificationSettingsModal = dynamic(
  () => import('@/components/NotificationSettingsModal'),
  { ssr: false }
)

export default function FavoritesHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">★ 즐겨찾기</h1>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          🔔 알림 설정
        </button>
      </div>
      {open && <NotificationSettingsModal onClose={() => setOpen(false)} />}
    </>
  )
}
