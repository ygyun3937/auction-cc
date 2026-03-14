// public/sw.js
self.addEventListener('push', event => {
  let data = { title: '알림', body: '' }
  if (event.data) {
    try { data = event.data.json() } catch (_) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
