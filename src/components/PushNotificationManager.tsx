// src/components/PushNotificationManager.tsx
'use client'

import { useEffect } from 'react'

export default function PushNotificationManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    async function registerSW() {
      try {
        // 이미 등록된 SW가 있으면 재등록하지 않음
        const existing = await navigator.serviceWorker.getRegistration('/sw.js')
        if (existing) return
        await navigator.serviceWorker.register('/sw.js')
      } catch (err) {
        console.error('[PushNotificationManager] SW registration failed:', err)
      }
    }

    registerSW()
  }, [])

  return null
}
