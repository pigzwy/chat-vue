// 自 useMediaModels.ts 移植：创作台模型选择（目录精选 + 按 provider 可用性过滤）
// 分组对用户不可见——每个模型按 provider 绑定默认分组（GPT Image 2 → 25，Grok 全系 → 66）
import { createStore } from '@/lib/store'
import { loadAppConfig, resolveMediaGroupId } from '@/lib/runtime-config'
import {
  clearApiKeyForGroup,
  getApiKeyForGroup,
  getModelsForGroup,
  hasSub2apiToken,
  modelsStore
} from '@/lib/models-store'
import {
  defaultGrokMediaGroupId,
  defaultImageModelId,
  defaultOpenaiMediaGroupId,
  defaultVideoModelId,
  isMediaModelId,
  mediaApiKeyName,
  mediaModelCatalog,
  resolveMediaModelSpec,
  type MediaKind,
  type MediaModelSpec
} from '@/lib/shared/media-models'

export interface MediaModelOption {
  label: string
  value: string
  provider: 'openai' | 'grok'
  description?: string
  price?: string
}

export interface MediaModelsState {
  mediaMode: MediaKind
  openaiGroupId: number
  grokGroupId: number
  imageModel: string
  videoModel: string
  /**
   * 严格可用性模式(sk 直连):单 key 单分组,可用列表是权威的——
   * 目录过滤为空时不回退到全目录,而是从 key 的真实模型里推断选项;
   * JWT 模式保持宽松(分组瞬时失败不能误判不可用)。
   */
  strictAvailability: boolean
  /**
   * 按 provider 分开记录可用模型 id。null = 未知（未登录或该分组拉取失败）。
   * 某个分组瞬时失败时不能把它的模型判为"不可用"——否则会静默改写用户
   * 已选的模型（计费/能力随之全变），恢复后也不会切回。
   */
  openaiAvailableIds: Set<string> | null
  grokAvailableIds: Set<string> | null
  loadingModels: boolean
}

const MODE_KEY = 'sub2api-media-mode'
const OPENAI_GROUP_KEY = 'sub2api-media-group-openai'
const GROK_GROUP_KEY = 'sub2api-media-group-grok'
const IMAGE_MODEL_KEY = 'sub2api-media-image-model'
const VIDEO_MODEL_KEY = 'sub2api-media-video-model'

function readStored(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : raw
  } catch {
    return raw
  }
}

function writeStored(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

function initialState(): MediaModelsState {
  const mode = readStored(MODE_KEY, 'image')
  return {
    mediaMode: mode === 'video' ? 'video' : 'image',
    openaiGroupId: Number(readStored(OPENAI_GROUP_KEY, String(defaultOpenaiMediaGroupId))) || defaultOpenaiMediaGroupId,
    grokGroupId: Number(readStored(GROK_GROUP_KEY, String(defaultGrokMediaGroupId))) || defaultGrokMediaGroupId,
    imageModel: readStored(IMAGE_MODEL_KEY, defaultImageModelId),
    videoModel: readStored(VIDEO_MODEL_KEY, defaultVideoModelId),
    openaiAvailableIds: null,
    grokAvailableIds: null,
    loadingModels: false,
    strictAvailability: false
  }
}

export const mediaModelsStore = createStore<MediaModelsState>(initialState(), {
  // 与服务端渲染分支（无 localStorage）一致的快照，避免 /studio 直连水合不匹配
  serverSnapshot: {
    mediaMode: 'image',
    openaiGroupId: defaultOpenaiMediaGroupId,
    grokGroupId: defaultGrokMediaGroupId,
    imageModel: defaultImageModelId,
    videoModel: defaultVideoModelId,
    openaiAvailableIds: null,
    grokAvailableIds: null,
    loadingModels: false,
    strictAvailability: false
  }
})

function priceTextForSpec(spec: MediaModelSpec) {
  if (spec.kind === 'video') {
    const rates = spec.costPerSecondByResolution ? Object.values(spec.costPerSecondByResolution) : []
    if (!rates.length) return undefined
    return `$${Math.min(...rates)}~${Math.max(...rates)}/秒`
  }
  if (spec.costPerImage) {
    return spec.costPerImageMax && spec.costPerImageMax !== spec.costPerImage
      ? `$${spec.costPerImage}~${spec.costPerImageMax}/张`
      : `$${spec.costPerImage}/张`
  }
  if (spec.costByResolution) {
    const rates = Object.values(spec.costByResolution)
    return `$${Math.min(...rates)}~${Math.max(...rates)}/张`
  }
  return undefined
}

function toOption(spec: MediaModelSpec): MediaModelOption {
  return {
    label: spec.label,
    value: spec.id,
    provider: spec.provider,
    description: spec.description,
    price: priceTextForSpec(spec)
  }
}

export function groupForModel(modelId: string) {
  const state = mediaModelsStore.get()
  const spec = resolveMediaModelSpec(modelId)
  if (spec.provider === 'grok') return state.grokGroupId
  return spec.defaultGroupId ?? state.openaiGroupId
}

export function curatedMediaOptions(state: MediaModelsState, kind: MediaKind): MediaModelOption[] {
  const specs = mediaModelCatalog.filter(spec => spec.kind === kind)
  const filtered = specs.filter((spec) => {
    const available = spec.provider === 'grok' ? state.grokAvailableIds : state.openaiAvailableIds
    return !available || available.has(spec.id)
  })
  if (filtered.length) return filtered.map(toOption)

  if (state.strictAvailability) {
    // sk 直连:目录全军覆没时,从 key 真实模型里捞该类目的媒体模型(推断能力),仍无则如实返回空
    const availableIds = new Set([
      ...(state.openaiAvailableIds || []),
      ...(state.grokAvailableIds || [])
    ])
    const seen = new Set<string>()
    return [...availableIds]
      .filter(id => isMediaModelId(id))
      .map(id => resolveMediaModelSpec(id))
      .filter((spec) => {
        if (spec.kind !== kind || seen.has(spec.id)) return false
        seen.add(spec.id)
        return true
      })
      .map(toOption)
  }

  return specs.map(toOption)
}

export function activeMediaModel(state: MediaModelsState) {
  return state.mediaMode === 'video' ? state.videoModel : state.imageModel
}

/** 模型列表变化后校正当前选择（避免残留不存在的模型 id） */
function correctSelections() {
  const state = mediaModelsStore.get()
  const imageOptions = curatedMediaOptions(state, 'image')
  const videoOptions = curatedMediaOptions(state, 'video')
  const patch: Partial<MediaModelsState> = {}

  if (!imageOptions.some(item => item.value === state.imageModel)) {
    patch.imageModel = imageOptions[0]?.value || defaultImageModelId
    writeStored(IMAGE_MODEL_KEY, patch.imageModel)
  }
  if (!videoOptions.some(item => item.value === state.videoModel)) {
    patch.videoModel = videoOptions[0]?.value || defaultVideoModelId
    writeStored(VIDEO_MODEL_KEY, patch.videoModel)
  }
  if (Object.keys(patch).length) {
    mediaModelsStore.set(prev => ({ ...prev, ...patch }))
  }
}

export async function refreshGroupModels() {
  if (!hasSub2apiToken()) {
    mediaModelsStore.set(prev => ({ ...prev, openaiAvailableIds: null, grokAvailableIds: null }))
    correctSelections()
    return
  }

  // 分组 id 经运行时配置重解析(localStorage 覆盖 > 服务端 env > 内置默认)
  await loadAppConfig()
  const openaiGroupId = resolveMediaGroupId('openai')
  const grokGroupId = resolveMediaGroupId('grok')

  const strict = Boolean(modelsStore.get().manualKey)
  mediaModelsStore.set(prev => ({ ...prev, openaiGroupId, grokGroupId, loadingModels: true, strictAvailability: strict }))
  try {
    // 只拉两个默认媒体分组（会按需为各分组自动创建 key），不做全分组扫描
    const [openaiResult, grokResult] = await Promise.allSettled([
      getModelsForGroup(openaiGroupId, mediaApiKeyName),
      getModelsForGroup(grokGroupId, mediaApiKeyName)
    ])
    mediaModelsStore.set(prev => ({
      ...prev,
      openaiAvailableIds: openaiResult.status === 'fulfilled' && openaiResult.value.length
        ? new Set(openaiResult.value.map(item => item.value))
        : null,
      grokAvailableIds: grokResult.status === 'fulfilled' && grokResult.value.length
        ? new Set(grokResult.value.map(item => item.value))
        : null
    }))
    correctSelections()
  } finally {
    mediaModelsStore.set(prev => ({ ...prev, loadingModels: false }))
  }
}

export function setMediaMode(mode: MediaKind) {
  mediaModelsStore.set(prev => ({ ...prev, mediaMode: mode }))
  writeStored(MODE_KEY, mode)
}

export function selectMediaModel(modelId: string) {
  const { mediaMode } = mediaModelsStore.get()
  if (mediaMode === 'video') {
    mediaModelsStore.set(prev => ({ ...prev, videoModel: modelId }))
    writeStored(VIDEO_MODEL_KEY, modelId)
  } else {
    mediaModelsStore.set(prev => ({ ...prev, imageModel: modelId }))
    writeStored(IMAGE_MODEL_KEY, modelId)
  }
}

export function getMediaApiKey() {
  return getApiKeyForGroup(groupForModel(activeMediaModel(mediaModelsStore.get())), mediaApiKeyName)
}

export function clearMediaApiKey() {
  clearApiKeyForGroup(groupForModel(activeMediaModel(mediaModelsStore.get())))
}

export function initMediaModels() {
  void refreshGroupModels()
}
