// src/lib/webpush.ts
import webpush from 'web-push'

let vapidInitialized = false

function ensureVapid() {
  if (vapidInitialized) return
  if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID env vars are not set (VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  vapidInitialized = true
}

export interface PushPayload {
  title: string
  body: string
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  ensureVapid()
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
  )
}
