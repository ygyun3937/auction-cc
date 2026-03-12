// Discord webhook notifications for favorited products

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

async function sendWebhook(webhookUrl: string, embeds: DiscordEmbed[]) {
  const body = JSON.stringify({ username: '경매 모니터', embeds })

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'DiscordBot (https://github.com, 1.0)',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord webhook failed: ${res.status} ${text}`)
  }
}

function priceColor(changeRate: number | null): number {
  if (changeRate === null) return 0x95a5a6  // gray
  if (changeRate > 0) return 0xe74c3c       // red (가격 상승)
  if (changeRate < 0) return 0x3498db       // blue (가격 하락)
  return 0x2ecc71                           // green (변동 없음)
}

function formatChange(changeRate: number | null): string {
  if (changeRate === null) return '-'
  const sign = changeRate > 0 ? '▲' : changeRate < 0 ? '▼' : '━'
  return `${sign} ${Math.abs(changeRate).toFixed(1)}%`
}

export interface FavoriteProductPrice {
  productCode: string
  productName: string
  unit: string
  unitQty: number
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalVolume: number
  changeRate: number | null
  priceDate: string
}

export async function notifyFavoritesPrices(products: FavoriteProductPrice[], webhookUrl: string) {
  if (products.length === 0) return

  const chunks: FavoriteProductPrice[][] = []
  for (let i = 0; i < products.length; i += 10) {
    chunks.push(products.slice(i, i + 10))
  }

  let successCount = 0
  let lastError: Error | null = null

  for (const chunk of chunks) {
    const embeds: DiscordEmbed[] = chunk.map(p => ({
      title: `${p.productName} (${p.unit})`,
      color: priceColor(p.changeRate),
      fields: [
        { name: '평균가', value: `**${p.avgPrice.toLocaleString()}원**`, inline: true },
        { name: '등락률', value: formatChange(p.changeRate), inline: true },
        { name: '거래량', value: `${p.totalVolume.toLocaleString()} ${p.unit}`, inline: true },
        { name: '최저 / 최고', value: `${p.minPrice.toLocaleString()} ~ ${p.maxPrice.toLocaleString()}원`, inline: false },
      ],
      footer: { text: `기준일: ${p.priceDate}` },
    }))

    try {
      await sendWebhook(webhookUrl, embeds)
      successCount++
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[discord] Chunk send failed:`, err)
    }
  }

  if (successCount === 0 && lastError) {
    throw lastError
  }
}

export async function sendTestMessage(webhookUrl: string) {
  const embed: DiscordEmbed = {
    title: '✅ 연결 테스트 성공!',
    description: '경매 모니터에서 즐겨찾기 알림이 이 채널로 전송됩니다.',
    color: 0x2ecc71,
    fields: [],
    timestamp: new Date().toISOString(),
  }
  await sendWebhook(webhookUrl, [embed])
}
