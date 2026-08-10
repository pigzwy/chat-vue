'use client'

// 运行时配置:服务端 env(MEDIA_GROUP_* )经 /api/app-config 注入,换分组不用重构建镜像。
// 分组 id 解析顺序:localStorage 显式覆盖 > 服务端配置 > 内置默认(nanobanana 无内置默认)。
import {
  defaultGrokMediaGroupId,
  defaultOpenaiMediaGroupId
} from '@/lib/shared/media-models'

export type MediaGroupProvider = 'openai' | 'grok' | 'nanobanana'

interface AppConfig {
  mediaGroups: Partial<Record<MediaGroupProvider, number>>
}

const builtinDefaults: Record<MediaGroupProvider, number> = {
  openai: defaultOpenaiMediaGroupId,
  grok: defaultGrokMediaGroupId,
  nanobanana: 0
}

let config: AppConfig = { mediaGroups: {} }
let loading: Promise<void> | null = null

/** 拉取一次服务端运行时配置(失败静默,回落内置默认) */
export function loadAppConfig() {
  if (typeof window === 'undefined') return Promise.resolve()
  loading ??= fetch('/api/app-config')
    .then(async (response) => {
      if (!response.ok) return
      const parsed = await response.json() as AppConfig
      if (parsed && typeof parsed === 'object') config = { mediaGroups: parsed.mediaGroups || {} }
    })
    .catch(() => {})
  return loading
}

function normalizeGroupId(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function readStoredGroupId(key: string) {
  const raw = window.localStorage.getItem(key)
  if (raw == null) return 0
  try {
    return normalizeGroupId(JSON.parse(raw))
  } catch {
    return normalizeGroupId(raw)
  }
}

/** 解析某 provider 的媒体分组 id;0 = 未配置(该 provider 不可用) */
export function resolveMediaGroupId(provider: MediaGroupProvider) {
  if (typeof window !== 'undefined') {
    const stored = readStoredGroupId(`sub2api-media-group-${provider}`)
    if (stored) return stored
  }
  return normalizeGroupId(config.mediaGroups[provider]) || builtinDefaults[provider]
}
