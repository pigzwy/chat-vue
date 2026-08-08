// 自 shared/utils/images.ts 移植（逐行等价，icon 字段由组件层映射 lucide 图标）

export const imageRatios = ['1:1', '3:2', '16:9', '21:9', '9:16', '4:3', '3:4', 'Auto'] as const
export const imageResolutions = ['1K', '2K', '4K'] as const
export const imageQualities = ['low', 'medium', 'high'] as const

export type ImageRatio = typeof imageRatios[number]
export type ImageResolution = typeof imageResolutions[number]
export type ImageQuality = typeof imageQualities[number]

export const defaultImageQuality: ImageQuality = 'high'

export const imageQualityItems: Array<{
  label: string
  value: ImageQuality
  description: string
}> = [
  { label: 'Low', value: 'low', description: '速度更快，适合草稿测试' },
  { label: 'Medium', value: 'medium', description: '质量和耗时更均衡' },
  { label: 'High', value: 'high', description: '细节更好，耗时更长' }
]

export function getImageQualityLabel(value: ImageQuality) {
  return imageQualityItems.find(item => item.value === value)?.label || 'High'
}

export const imageSizeMap: Record<ImageResolution, Record<ImageRatio, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1024x683',
    '16:9': '1024x576',
    '21:9': '1024x439',
    '9:16': '576x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
    Auto: 'auto'
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2048x1365',
    '16:9': '2048x1152',
    '21:9': '2048x878',
    '9:16': '1152x2048',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    Auto: 'auto'
  },
  '4K': {
    '1:1': '2880x2880',
    '3:2': '3456x2304',
    '16:9': '3840x2160',
    '21:9': '3808x1632',
    '9:16': '2160x3840',
    '4:3': '3264x2448',
    '3:4': '2448x3264',
    Auto: 'auto'
  }
}
