// src/components/PushNotificationManager.tsx
'use client'

import { useEffect } from 'react'

export default function PushNotificationManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    async function registerSW() {
      try {
        await navigator.serviceWorker.register('/sw.js')
      } catch (err) {
        console.error('[PushNotificationManager] SW registration failed:', err)
      }
    }

    registerSW()
  }, [])

  return null
}
