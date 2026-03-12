'use client'

import { useState, useEffect } from 'react'

interface Settings {
  webhookUrl: string | null
  lastNotifiedAt: string | null
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

  useEffect(() => {
    fetch('/api/user/notification-settings')
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data)
        if (data.webhookUrl) setInputUrl(data.webhookUrl)
      })
      .catch(() => {
        setSettings({ webhookUrl: null, lastNotifiedAt: null })
      })
  }, [])

  async function handleSave() {
    setStatus('saving')
    setMessage('')
    const res = await fetch('/api/user/notification-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: inputUrl || null }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings(prev => ({ ...prev!, webhookUrl: inputUrl || null }))
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
      setMessage('Discord에 테스트 메시지를 전송했습니다!')
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
      setSettings({ webhookUrl: null, lastNotifiedAt: null })
      setInputUrl('')
      setIsEditing(false)
      setStatus('idle')
      setMessage('')
    }
  }

  const isConfigured = !!settings?.webhookUrl

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
            {/* URL input / display */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Webhook URL</label>
              {isConfigured && !isEditing ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-500 truncate">
                    {maskUrl(settings.webhookUrl!)}
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
                  className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              )}
              <p className="text-xs text-gray-400 mt-1">
                Discord 서버 설정 → 연동 → 웹후크에서 URL을 복사하세요
              </p>
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

            {/* Buttons */}
            <div className="flex gap-2">
              {isConfigured && !isEditing && (
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
            {isConfigured && (
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
