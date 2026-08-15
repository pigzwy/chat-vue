import type { RequestError } from '../../shared/utils/errors'

/**
 * Gemini(Nano Banana)生图上游:网关不给 gemini 开 /v1/images 端点,
 * 正确入口是 Gemini 原生 POST {root}/v1beta/models/{model}:generateContent
 * (认证 Authorization: Bearer <key>;图片在 candidates[].content.parts[].inlineData)。
 * 计费为按图:单价 × 尺寸倍率(1K×1 / 2K×1.5 / 4K×2)× 分组倍率——
 * 因此必须显式携带 imageConfig.imageSize,避免网关"未指定按 2K"的默认档。
 */

export interface GeminiReferenceImage {
  mimeType: string
  /** base64(不带 data: 前缀) */
  data: string
}

export interface GeminiImageBodyInput {
  prompt: string
  imageSize?: '1K' | '2K' | '4K'
  aspectRatio?: string
  referenceImages?: GeminiReferenceImage[]
}

export function buildGeminiImageBody(input: GeminiImageBodyInput) {
  const parts: Array<Record<string, unknown>> = [{ text: input.prompt }]
  for (const ref of input.referenceImages || []) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
  }

  const imageConfig: Record<string, string> = {}
  if (input.imageSize) imageConfig.imageSize = input.imageSize
  if (input.aspectRatio) imageConfig.aspectRatio = input.aspectRatio

  return JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(Object.keys(imageConfig).length ? { imageConfig } : {})
    }
  })
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string, data?: string }
  inline_data?: { mime_type?: string, data?: string }
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string, status?: string }
}

export interface GeminiGeneratedImage {
  b64: string
  mimeType: string
}

/** 从 generateContent 响应里取全部内联图片(兼容 inlineData / inline_data 两种命名) */
export function extractGeminiImages(payload: GeminiGenerateResponse): GeminiGeneratedImage[] {
  const images: GeminiGeneratedImage[] = []
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      const inline = part.inlineData || part.inline_data
      const data = inline?.data
      if (typeof data === 'string' && data.length > 0) {
        const mime = (part.inlineData?.mimeType || part.inline_data?.mime_type || 'image/png').split(';')[0] || 'image/png'
        images.push({ b64: data, mimeType: mime })
      }
    }
  }
  return images
}

export interface CallGeminiImageOptions {
  /** 网关根地址(不带 /v1) */
  rootUrl: string
  apiKey: string
  model: string
  body: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function callGeminiImageGeneration(options: CallGeminiImageOptions): Promise<GeminiGeneratedImage[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${options.rootUrl.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: options.body,
    signal: options.signal
  })

  const text = await response.text().catch(() => '')
  let payload: GeminiGenerateResponse = {}
  try {
    payload = JSON.parse(text) as GeminiGenerateResponse
  } catch { /* 非 JSON 由下方统一报错 */ }

  if (!response.ok) {
    const message = payload.error?.message || text.slice(0, 300) || `Gemini 生图请求失败:HTTP ${response.status}`
    const error = new Error(message) as RequestError
    error.status = response.status
    throw error
  }

  const images = extractGeminiImages(payload)
  if (!images.length) {
    const blocked = payload.promptFeedback?.blockReason
    throw new Error(blocked
      ? `内容被上游安全策略拦截(${blocked}),请调整提示词`
      : 'Gemini 未返回图片数据,请重试或调整提示词')
  }
  return images
}
