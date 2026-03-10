export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV !== 'test') {
    const { default: cron } = await import('node-cron')

    // Run data collection every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      console.log('[instrumentation] Running scheduled auction data collection...')
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/cron/collect`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({}),
          }
        )
        const result = await response.json()
        console.log('[instrumentation] Collection result:', result)
      } catch (error) {
        console.error('[instrumentation] Collection failed:', error)
      }
    })

    console.log('[instrumentation] Cron scheduler registered (every hour)')
  }
}
