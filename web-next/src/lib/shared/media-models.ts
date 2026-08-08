// 自 shared/utils/mediaModels.ts 精简（聊天模型过滤用）

export function isImageMediaModelId(id: string) {
  return /^(gpt-image|grok-2-image|grok-imagine-image)/.test(id) || id === 'grok-imagine'
}

export function isVideoMediaModelId(id: string) {
  return /^grok-imagine-video/.test(id)
}

export function isMediaModelId(id: string) {
  return isImageMediaModelId(id) || isVideoMediaModelId(id) || /^grok-imagine/.test(id)
}
