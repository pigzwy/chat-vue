import type { FileUIPart, TextUIPart, UIMessage } from 'ai'

export const chatAttachmentLimit = 8
export const chatAttachmentMaxFileSize = 10 * 1024 * 1024
export const chatAttachmentMaxTotalSize = 25 * 1024 * 1024

export const chatAttachmentAcceptTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
  'text/csv'
] as const

export const chatAttachmentAccept = [
  ...chatAttachmentAcceptTypes,
  '.txt',
  '.md',
  '.markdown',
  '.pdf',
  '.json',
  '.csv'
].join(',')

const extensionMediaTypes: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  pdf: 'application/pdf',
  json: 'application/json',
  csv: 'text/csv'
}

const textAttachmentMediaTypes = [
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv'
] as const

const textAttachmentLanguages: Record<string, string> = {
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'application/json': 'json',
  'text/csv': 'csv'
}

const imageCapableModelPatterns = [
  /gpt-4\.1/i,
  /gpt-4o/i,
  /gpt-5/i,
  /claude/i,
  /gemini/i,
  /qwen.*vl/i,
  /vision/i
]

const documentCapableModelPatterns = [
  /gpt-4\.1/i,
  /gpt-4o/i,
  /gpt-5/i,
  /claude/i,
  /gemini/i
]

export function isImageMediaType(mediaType: string) {
  return mediaType.startsWith('image/')
}

export function isTextAttachmentMediaType(mediaType: string) {
  return textAttachmentMediaTypes.includes(mediaType as typeof textAttachmentMediaTypes[number])
}

export function getFileExtension(filename: string) {
  return filename.split('.').pop()?.toLowerCase() || ''
}

export function getAttachmentMediaType(file: Pick<File, 'name' | 'type'>) {
  return file.type || extensionMediaTypes[getFileExtension(file.name)] || 'application/octet-stream'
}

export function isSupportedChatAttachment(file: Pick<File, 'name' | 'type'>) {
  const mediaType = getAttachmentMediaType(file)
  return chatAttachmentAcceptTypes.includes(mediaType as typeof chatAttachmentAcceptTypes[number])
}

function matchesModelCapability(model: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(model))
}

export function isChatAttachmentSupportedByModel(file: Pick<File, 'name' | 'type'>, model: string) {
  const mediaType = getAttachmentMediaType(file)
  if (isTextAttachmentMediaType(mediaType)) return true
  if (isImageMediaType(mediaType)) return matchesModelCapability(model, imageCapableModelPatterns)
  if (mediaType === 'application/pdf') return matchesModelCapability(model, documentCapableModelPatterns)
  return false
}

export function getChatAttachmentUnsupportedReason(file: Pick<File, 'name' | 'type'>, model: string) {
  const mediaType = getAttachmentMediaType(file)

  if (!isSupportedChatAttachment(file)) {
    return `不支持上传 ${file.name}。当前仅支持 PNG、JPG、WEBP、GIF、PDF、TXT、Markdown、JSON、CSV。`
  }

  if (isChatAttachmentSupportedByModel(file, model)) return ''

  if (isImageMediaType(mediaType)) {
    return `当前模型不支持图片附件，无法上传 ${file.name}。请切换到支持视觉的模型。`
  }

  if (mediaType === 'application/pdf') {
    return `当前模型不支持 PDF 附件，无法上传 ${file.name}。请换成 TXT、Markdown、JSON 或 CSV，或切换到支持文档的模型。`
  }

  return `当前模型不支持 ${mediaType} 附件，无法上传 ${file.name}。`
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function fileToUIPart(file: File): Promise<FileUIPart> {
  return {
    type: 'file',
    mediaType: getAttachmentMediaType(file),
    filename: file.name,
    url: await fileToDataUrl(file)
  }
}

export async function fileToTextUIPart(file: File): Promise<TextUIPart> {
  const mediaType = getAttachmentMediaType(file)
  const content = await file.text()
  const fence = content.includes('```') ? '````' : '```'
  const language = textAttachmentLanguages[mediaType] || 'text'

  return {
    type: 'text',
    text: [
      `Attached file: ${file.name}`,
      `Media type: ${mediaType}`,
      '',
      `${fence}${language}`,
      content,
      fence
    ].join('\n')
  }
}

export async function fileToMessageParts(file: File): Promise<UIMessage['parts']> {
  const mediaType = getAttachmentMediaType(file)
  if (isTextAttachmentMediaType(mediaType)) {
    return [await fileToTextUIPart(file)]
  }

  return [await fileToUIPart(file)]
}
