'use client'

// 账号级生成历史(服务端 SQLite,只存 URL+过期时间):
// 查询凭证 = 客户端手上的全部 API Key(sk 手填 + JWT 模式各分组自动建的 key),
// 服务端按 key 指纹取并集。本设备图片仍走 IndexedDB 缓存,这里是跨设备/清缓存后的清单。
import { csrfHeaderName, getCsrfToken } from '@/lib/csrf'
import { modelsStore } from '@/lib/models-store'

export interface CloudHistoryItem {
  id: string
  kind: 'image' | 'video'
  model: string
  prompt: string
  imageUrl: string
  expiresAt: number
  costUsd?: number
  createdAt: number
}

function readCachedGroupKeys(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem('sub2api-api-keys')
    if (!raw) return []
    const parsed = JSON.parse(raw) as Record<string, string | { key?: string }>
    return Object.values(parsed)
      .map(item => (typeof item === 'string' ? item : item?.key || ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

/** 收集当前用户手上的全部 key(去重),作为历史查询凭证 */
export function collectHistoryKeys() {
  const { manualKey, manualImageKey, manualGrokKey, manualNanoKey } = modelsStore.get()
  const keys = [manualKey, manualImageKey, manualGrokKey, manualNanoKey, ...readCachedGroupKeys()]
    .map(key => key?.trim() || '')
    .filter(key => key.length >= 20)
  return [...new Set(keys)].slice(0, 10)
}

export async function fetchCloudHistory(options: { before?: number, limit?: number } = {}) {
  const apiKeys = collectHistoryKeys()
  if (!apiKeys.length) return { items: [] as CloudHistoryItem[] }

  const response = await fetch('/api/media/history', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [csrfHeaderName]: getCsrfToken()
    },
    body: JSON.stringify({
      apiKeys,
      ...(options.limit ? { limit: options.limit } : {}),
      ...(options.before ? { before: options.before } : {})
    })
  })
  if (!response.ok) {
    throw new Error(`历史加载失败(${response.status})`)
  }
  return await response.json() as { items: CloudHistoryItem[] }
}

export function expiryText(expiresAt: number, now = Date.now()) {
  const left = expiresAt - now
  if (left <= 0) return '已过期'
  const days = Math.floor(left / 86_400_000)
  if (days >= 1) return `约 ${days} 天后过期`
  const hours = Math.max(1, Math.floor(left / 3_600_000))
  return `约 ${hours} 小时后过期`
}
