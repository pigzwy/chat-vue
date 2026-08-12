import type { ImageRatio, ImageResolution } from './images'

export type MediaKind = 'image' | 'video'

export const videoResolutions = ['480p', '720p'] as const
export type VideoResolution = typeof videoResolutions[number]
export const defaultVideoResolution: VideoResolution = '480p'

export interface MediaModelSpec {
  id: string
  label: string
  /** 模型选择器里的一句话说明 */
  description?: string
  kind: MediaKind
  provider: 'openai' | 'grok' | 'google'
  /** 支持 multipart 图片编辑（/images/edits） */
  supportsEdit?: boolean
  /** 支持 size/quality 参数与尺寸提示注入（gpt-image 系） */
  supportsSizeQuality?: boolean
  /** 支持 SSE 流式返回（不支持的模型强制走同步请求） */
  supportsStream?: boolean
  /** 支持图生视频源图 */
  supportsSourceImage?: boolean
  /** 支持视频 resolution 参数（480p/720p） */
  supportsVideoResolution?: boolean
  /** 支持的画面比例（不设 = 全部支持；grok 系上游是有限集合，越界会 422） */
  supportedAspectRatios?: ImageRatio[]
  maxDurationSeconds?: number
  costByResolution?: Partial<Record<ImageResolution, number>>
  /** 每张图片费用（美元） */
  costPerImage?: number
  /** 每张图片费用上限（输出尺寸更大时的档位，美元） */
  costPerImageMax?: number
  /** 视频每秒费用（美元，按分辨率，网关实测） */
  costPerSecondByResolution?: Record<VideoResolution, number>
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
    description: '细节丰富，支持编辑与多参考图，4K 为尽力输出（gpt-image-2）',
    kind: 'image',
    provider: 'openai',
    supportsEdit: true,
    supportsSizeQuality: true,
    supportsStream: true,
    costByResolution: { '1K': 0.2, '2K': 0.2, '4K': 0.2 },
    defaultGroupId: defaultOpenaiMediaGroupId
  },
  {
    id: 'gemini-3.1-flash-image',
    label: 'Nano Banana · 快速',
    description: '谷歌 Gemini 文生图，出图快（gemini-3.1-flash-image）',
    kind: 'image',
    provider: 'google',
    supportedAspectRatios: [],
    costPerImage: 0.2
  },
  {
    id: 'gemini-3-pro-image',
    label: 'Nano Banana · Pro',
    description: '谷歌 Gemini 高质量文生图（gemini-3-pro-image）',
    kind: 'image',
    provider: 'google',
    supportedAspectRatios: [],
    costPerImage: 0.2
  },
  {
    id: 'grok-imagine-image',
    label: 'Grok 画图 · 快速',
    description: '出图快，支持以图生图，参考图最多 3 张（grok-imagine-image）',
    kind: 'image',
    provider: 'grok',
    supportsEdit: true,
    supportedAspectRatios: ['1:1', '3:2', '16:9', '9:16', '4:3', '3:4'],
    costPerImage: 0.2,
    defaultGroupId: defaultGrokMediaGroupId
  },
  {
    id: 'grok-imagine-image-quality',
    label: 'Grok 画图 · 高清',
    description: '更高质量输出，支持以图生图（grok-imagine-image-quality）',
    kind: 'image',
    provider: 'grok',
    supportsEdit: true,
    supportedAspectRatios: ['1:1', '3:2', '16:9', '9:16', '4:3', '3:4'],
    costPerImage: 0.2,
    defaultGroupId: defaultGrokMediaGroupId
  },
  {
    id: 'grok-imagine-video',
    label: 'Grok 视频 · 标准',
    description: '文生视频 / 图生视频，最长 15 秒（grok-imagine-video）',
    kind: 'video',
    provider: 'grok',
    supportsSourceImage: true,
    supportsVideoResolution: true,
    maxDurationSeconds: 15,
    costPerSecondByResolution: { '480p': 0.05, '720p': 0.05 },
    defaultGroupId: defaultGrokMediaGroupId
  },
  {
    id: 'grok-imagine-video-1.5',
    label: 'Grok 视频 · 1.5',
    description: '新版画质更好；纯文生视频自动用标准版（grok-imagine-video-1.5）',
    kind: 'video',
    provider: 'grok',
    supportsSourceImage: true,
    supportsVideoResolution: true,
    maxDurationSeconds: 15,
    costPerSecondByResolution: { '480p': 0.05, '720p': 0.05 },
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
  if (/^gemini-[\w.-]*image/.test(id)) {
    return { id, label: id, kind: 'image', provider: 'google', supportedAspectRatios: [], costPerImage: 0.2 }
  }
  if (isVideoMediaModelId(id)) {
    return { id, label: id, kind: 'video', provider: 'grok', supportsSourceImage: true, maxDurationSeconds: 15, costPerSecondByResolution: { '480p': 0.05, '720p': 0.05 }, defaultGroupId: defaultGrokMediaGroupId }
  }
  if (isGrokMediaModelId(id)) {
    return { id, label: id, kind: 'image', provider: 'grok', supportedAspectRatios: ['1:1', '3:2', '16:9', '9:16', '4:3', '3:4'], defaultGroupId: defaultGrokMediaGroupId }
  }
  return { id, label: id, kind: 'image', provider: 'openai', defaultGroupId: defaultOpenaiMediaGroupId }
}

export function isImageMediaModelId(id: string) {
  return /^(gpt-image|grok-2-image|grok-imagine-image)/.test(id) || /^gemini-[\w.-]*image/.test(id) || id === 'grok-imagine'
}

export function isVideoMediaModelId(id: string) {
  return /^grok-imagine-video/.test(id)
}

export function isGrokMediaModelId(id: string) {
  return /^(grok-|x-ai\/)/.test(id)
}

/** 媒体模型（画图/视频/编辑），不能出现在聊天模型列表里——发到聊天端点会被上游 400 */
export function isMediaModelId(id: string) {
  return isImageMediaModelId(id) || isVideoMediaModelId(id) || /^grok-imagine/.test(id)
}
