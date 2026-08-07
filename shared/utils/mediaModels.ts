import type { ImageResolution } from './images'

export type MediaKind = 'image' | 'video'

export interface MediaModelSpec {
  id: string
  label: string
  kind: MediaKind
  provider: 'openai' | 'grok'
  /** 支持 multipart 图片编辑（/images/edits） */
  supportsEdit?: boolean
  /** 支持 size/quality 参数与尺寸提示注入（gpt-image 系） */
  supportsSizeQuality?: boolean
  /** 支持 SSE 流式返回（不支持的模型强制走同步请求） */
  supportsStream?: boolean
  /** 支持图生视频源图 */
  supportsSourceImage?: boolean
  maxDurationSeconds?: number
  costByResolution?: Partial<Record<ImageResolution, number>>
  /** 该模型默认使用的 Sub2API 分组 */
  defaultGroupId?: number
}

/** GPT Image 2 所在的默认画图分组 */
export const defaultOpenaiMediaGroupId = 25
/** Grok 全系（画图 + 视频）所在的默认分组（企业 Grok | Pro/Heavy） */
export const defaultGrokMediaGroupId = 66

export const mediaModelCatalog: MediaModelSpec[] = [
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    kind: 'image',
    provider: 'openai',
    supportsEdit: true,
    supportsSizeQuality: true,
    supportsStream: true,
    costByResolution: { '1K': 0.135, '2K': 0.18, '4K': 0.27 },
    defaultGroupId: defaultOpenaiMediaGroupId
  },
  {
    id: 'grok-imagine-image',
    label: 'Grok Imagine',
    kind: 'image',
    provider: 'grok',
    defaultGroupId: defaultGrokMediaGroupId
  },
  {
    id: 'grok-imagine-image-quality',
    label: 'Grok Imagine HQ',
    kind: 'image',
    provider: 'grok',
    defaultGroupId: defaultGrokMediaGroupId
  },
  {
    id: 'grok-imagine-video',
    label: 'Grok 视频',
    kind: 'video',
    provider: 'grok',
    supportsSourceImage: true,
    maxDurationSeconds: 15,
    defaultGroupId: defaultGrokMediaGroupId
  },
  {
    id: 'grok-imagine-video-1.5',
    label: 'Grok 视频 1.5',
    kind: 'video',
    provider: 'grok',
    supportsSourceImage: true,
    maxDurationSeconds: 15,
    defaultGroupId: defaultGrokMediaGroupId
  }
]

export const defaultImageModelId = 'gpt-image-2'
export const defaultVideoModelId = 'grok-imagine-video-1.5'
export const mediaApiKeyName = 'chat | draw'

export function getMediaModelSpec(id: string) {
  return mediaModelCatalog.find(spec => spec.id === id)
}

/** 目录未收录的模型按 id 模式推断能力（例如分组里出现新的 gpt-image-* 变体） */
export function resolveMediaModelSpec(id: string): MediaModelSpec {
  const found = getMediaModelSpec(id)
  if (found) return found

  if (/^gpt-image/.test(id)) {
    return { id, label: id, kind: 'image', provider: 'openai', supportsEdit: true, supportsSizeQuality: true, supportsStream: true, defaultGroupId: defaultOpenaiMediaGroupId }
  }
  if (isVideoMediaModelId(id)) {
    return { id, label: id, kind: 'video', provider: 'grok', supportsSourceImage: true, maxDurationSeconds: 15, defaultGroupId: defaultGrokMediaGroupId }
  }
  if (isGrokMediaModelId(id)) {
    return { id, label: id, kind: 'image', provider: 'grok', defaultGroupId: defaultGrokMediaGroupId }
  }
  return { id, label: id, kind: 'image', provider: 'openai', defaultGroupId: defaultOpenaiMediaGroupId }
}

export function isImageMediaModelId(id: string) {
  return /^(gpt-image|grok-2-image|grok-imagine-image)/.test(id) || id === 'grok-imagine'
}

export function isVideoMediaModelId(id: string) {
  return /^grok-imagine-video/.test(id)
}

export function isGrokMediaModelId(id: string) {
  return /^(grok-|x-ai\/)/.test(id)
}
