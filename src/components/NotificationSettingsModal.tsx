'use client'

import { useState, useEffect } from 'react'

interface Settings {
  webhookUrl: string | null
  discordUserId: string | null
  discordUsername: string | null
  discordBotInviteUrl: string | null
  lastNotifiedAt: string | null
  notifyHour: number | null
  notifyMinute: number | null
  notifyDays: string | null
}

function maskUrl(url: string): string {
  const parts = url.split('/')
  const id = parts[parts.length - 2] ?? '****'
  return `https://discord.com/api/webhooks/${id}/****`
}

function formatKST(isoString: string): string {
  return new Date(isoString).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [inputUrl, setInputUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [notifyHour, setNotifyHour] = useState<number | null>(null)
  const [notifyMinute, setNotifyMinute] = useState<number | null>(null)
  const [notifyDaysArr, setNotifyDaysArr] = useState<number[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [serverEndpoints, setServerEndpoints] = useState<string[]>([])
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [discordConnected, setDiscordConnected] = useState<string | null>(null)
  const [disconnectingDiscord, setDisconnectingDiscord] = useState(false)
  const [showWebhookSection, setShowWebhookSection] = useState(false)

  useEffect(() => {
    fetch('/api/user/notification-settings')
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data)
        if (data.webhookUrl) setInputUrl(data.webhookUrl)
        setNotifyHour(data.notifyHour)
        setNotifyMinute(data.notifyMinute)
        setNotifyDaysArr(
          data.notifyDays ? data.notifyDays.split(',').map(Number) : []
        )
        setDiscordConnected(data.discordUserId ? (data.discordUsername ?? data.discordUserId) : null)
        if (data.webhookUrl) setShowWebhookSection(true)
      })
      .catch(() => {
        setSettings({ webhookUrl: null, discordUserId: null, discordUsername: null, discordBotInviteUrl: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null })
      })

    // Web Push 초기 로딩
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return
    setPushSupported(true)

    async function loadPushState() {
      try {
        const [serverRes, registration] = await Promise.all([
          fetch('/api/user/push-subscription').then(r => r.json()),
          navigator.serviceWorker.getRegistration('/sw.js'),
        ])
        const endpoints: string[] = serverRes.endpoints ?? []
        setServerEndpoints(endpoints)

        if (!registration) {
          setSwRegistration(null)
          setIsSubscribed(false)
          return
        }
        setSwRegistration(registration)

        const sub = await registration.pushManager.getSubscription()
        setIsSubscribed(sub ? endpoints.includes(sub.endpoint) : false)
      } catch {
        setIsSubscribed(false)
      }
    }
    loadPushState()
  }, [])

  async function handleSave() {
    setStatus('saving')
    setMessage('')
    const daysValue = notifyDaysArr.length > 0
      ? [...notifyDaysArr].sort((a, b) => a - b).join(',')
      : null
    const res = await fetch('/api/user/notification-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl: inputUrl || null,
        notifyHour,
        notifyMinute,
        notifyDays: daysValue,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings(prev => ({
        ...prev!,
        webhookUrl: inputUrl || null,
        notifyHour,
        notifyMinute,
        notifyDays: daysValue,
      }))
      setIsEditing(false)
      setStatus('success')
      setMessage('저장됐습니다.')
    } else {
      setStatus('error')
      setMessage(data.error ?? '저장 실패')
    }
  }

  async function handleTest() {
    setStatus('testing')
    setMessage('')
    const res = await fetch('/api/user/notification-settings/test', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setStatus('success')
      const parts = []
      if (data.discord) parts.push('Discord')
      if (data.push) parts.push('브라우저 알림')
      setMessage(`${parts.join(', ')}으로 테스트 메시지를 전송했습니다!`)
    } else {
      setStatus('error')
      setMessage(data.error ?? '전송 실패')
    }
  }

  async function handleClear() {
    setStatus('saving')
    const res = await fetch('/api/user/notification-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: null }),
    })
    if (res.ok) {
      setSettings(prev => prev ? { ...prev, webhookUrl: null, lastNotifiedAt: null, notifyHour: null, notifyMinute: null, notifyDays: null } : prev)
      setInputUrl('')
      setNotifyHour(null)
      setNotifyMinute(null)
      setNotifyDaysArr([])
      setIsEditing(false)
      setStatus('idle')
      setMessage('')
    } else {
      setStatus('error')
      setMessage('해제 실패')
    }
  }

  async function handleDiscordDisconnect() {
    if (!confirm('Discord 연결을 해제할까요?')) return
    setDisconnectingDiscord(true)
    const res = await fetch('/api/auth/discord/disconnect', { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json() as { clearedSchedule?: boolean }
      setDiscordConnected(null)
      if (data.clearedSchedule) {
        setNotifyHour(null)
        setNotifyMinute(null)
        setNotifyDaysArr([])
        setSettings(prev => prev ? { ...prev, discordUserId: null, discordUsername: null, notifyHour: null, notifyMinute: null, notifyDays: null } : prev)
      } else {
        setSettings(prev => prev ? { ...prev, discordUserId: null, discordUsername: null } : prev)
      }
    }
    setDisconnectingDiscord(false)
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
  }

  async function handlePushSubscribe() {
    setPushMessage('')
    if (!swRegistration) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setPushMessage('브라우저 설정에서 알림을 허용해주세요')
      return
    }

    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushMessage('Push 설정 오류: VAPID 공개키가 구성되지 않았습니다')
        return
      }
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subJson = sub.toJSON()
      const res = await fetch('/api/user/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
        }),
      })

      if (!res.ok) {
        throw new Error(`Server rejected subscription: ${res.status}`)
      }

      setIsSubscribed(true)
      setServerEndpoints(prev => [...prev, sub.endpoint])
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
      setPushMessage('구독 중 오류가 발생했습니다')
    }
  }

  async function handlePushUnsubscribe() {
    setPushMessage('')
    if (!swRegistration) return

    try {
      const sub = await swRegistration.pushManager.getSubscription()
      if (sub) {
        const delRes = await fetch('/api/user/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        if (!delRes.ok) {
          throw new Error(`Server rejected unsubscribe: ${delRes.status}`)
        }
        await sub.unsubscribe()
        setServerEndpoints(prev => prev.filter(e => e !== sub.endpoint))
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
      setPushMessage('구독 해제 중 오류가 발생했습니다')
    }
  }

  const isConfigured = !!(settings?.webhookUrl || discordConnected)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">🔔 Discord 알림 설정</h2>
            <p className="text-xs text-gray-500 mt-0.5">즐겨찾기 품목의 가격 변동을 Discord로 받습니다</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {settings === null ? (
          <p className="text-sm text-gray-400 text-center py-4">불러오는 중...</p>
        ) : (
          <>
            {/* Web Push 알림 섹션 */}
            {pushSupported && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">브라우저 알림 (Web Push)</label>
                {isSubscribed ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-700 dark:text-green-400">
                      이 기기에서 구독 중 ({serverEndpoints.length}개 기기)
                    </span>
                    <button
                      onClick={handlePushUnsubscribe}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      구독 해제
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handlePushSubscribe}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold"
                  >
                    이 기기에서 알림 받기
                  </button>
                )}
                {pushMessage && (
                  <p className="text-xs text-red-500 mt-1">{pushMessage}</p>
                )}
              </div>
            )}
            {/* Discord DM 알림 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Discord DM 알림</p>
              {discordConnected ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="text-green-600 dark:text-green-400 font-medium">✓ {discordConnected}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">DM으로 알림을 받습니다</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTest}
                      disabled={status === 'testing'}
                      className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 underline disabled:opacity-50"
                    >
                      {status === 'testing' ? '전송 중...' : '테스트'}
                    </button>
                    <button
                      onClick={handleDiscordDisconnect}
                      disabled={disconnectingDiscord}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline disabled:opacity-50"
                    >
                      {disconnectingDiscord ? '해제 중...' : '연결 해제'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Discord 계정을 연결하면 DM으로 알림을 받습니다</p>
                    <a
                      href="/api/auth/discord/connect"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shrink-0 ml-2"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z"/>
                      </svg>
                      Discord로 연결하기
                    </a>
                  </div>
                  {settings.discordBotInviteUrl && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      봇이 내 서버에 없다면{' '}
                      <a
                        href={settings.discordBotInviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500 hover:text-indigo-700 underline"
                      >
                        먼저 초대하세요
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* URL input / display */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowWebhookSection(v => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-2"
              >
                <span>{showWebhookSection ? '▾' : '▸'}</span>
                <span>웹훅 URL로 채널 알림 받기 (선택)</span>
              </button>
              {showWebhookSection && <>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Discord 채널 웹훅 URL</label>
              {settings.webhookUrl && !isEditing ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-500 truncate">
                    {maskUrl(settings.webhookUrl)}
                  </span>
                  <button
                    onClick={() => { setIsEditing(true); setStatus('idle'); setMessage('') }}
                    className="text-xs text-blue-500 hover:underline shrink-0"
                  >
                    수정
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              )}
              <p className="text-xs text-gray-400 mt-1">
                Discord 서버 설정 → 연동 → 웹후크에서 URL을 복사하세요
              </p>
              </>}
            </div>

            {/* Last notified */}
            {isConfigured && settings.lastNotifiedAt && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 mb-4">
                <span className="text-green-600 text-sm">✓</span>
                <span className="text-xs text-green-700 dark:text-green-400">
                  마지막 전송: {formatKST(settings.lastNotifiedAt)}
                </span>
              </div>
            )}

            {/* Status message */}
            {message && (
              <p className={`text-xs mb-3 ${status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                {message}
              </p>
            )}

            {/* Schedule */}
            {(isConfigured || inputUrl) && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">알림 시간</label>
                  <div className="flex gap-2">
                    <select
                      value={notifyHour ?? ''}
                      onChange={e => {
                        const val = e.target.value
                        if (val === '') {
                          setNotifyHour(null)
                          setNotifyMinute(null)
                        } else {
                          setNotifyHour(Number(val))
                          if (notifyMinute === null) setNotifyMinute(0)
                        }
                      }}
                      className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
                    >
                      <option value="">없음</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
                      ))}
                    </select>
                    <select
                      value={notifyMinute ?? ''}
                      disabled={notifyHour === null}
                      onChange={e => setNotifyMinute(Number(e.target.value))}
                      className="w-24 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-40"
                    >
                      <option value={0}>00분</option>
                      <option value={30}>30분</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                    알림 요일
                    <span className="ml-1.5 font-normal normal-case text-gray-400">
                      {notifyDaysArr.length === 0 ? '(매일)' : ''}
                    </span>
                  </label>
                  <div className="flex gap-1">
                    {['일', '월', '화', '수', '목', '금', '토'].map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setNotifyDaysArr(prev =>
                            prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                          )
                        }}
                        className={`flex-1 text-xs py-1 rounded-md border transition-colors ${
                          notifyDaysArr.includes(idx)
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              {(isConfigured || isSubscribed) && !isEditing && (
                <button
                  onClick={handleTest}
                  disabled={status === 'testing'}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50"
                >
                  {status === 'testing' ? '전송 중...' : '테스트 전송'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={status === 'saving' || (!inputUrl && !isConfigured)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
              >
                {status === 'saving' ? '저장 중...' : '저장'}
              </button>
            </div>

            {/* Clear */}
            {!!settings?.webhookUrl && (
              <div className="text-center mt-3">
                <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-600">
                  알림 해제
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
