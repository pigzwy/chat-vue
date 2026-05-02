export type ImageRatio = '1:1' | '3:2' | '16:9' | '21:9' | '9:16' | '4:3' | '3:4' | 'Auto'
export type ImageResolution = '1K' | '2K' | '4K'
export type ImageQuality = 'low' | 'medium' | 'high'

export const imageQuality: ImageQuality = 'high'

export const imageSizeMap: Record<ImageResolution, Record<ImageRatio, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1620x1080',
    '16:9': '1024x576',
    '21:9': '2520x1080',
    '9:16': '576x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
    Auto: 'auto'
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2160x1440',
    '16:9': '2560x1440',
    '21:9': '3360x1440',
    '9:16': '1440x2560',
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

export function buildImagePrompt(prompt: string, size: string, quality: ImageQuality = imageQuality) {
  const hints: string[] = []

  if (/^\d+x\d+$/.test(size)) {
    const [width, height] = size.split('x')
    hints.push(`Target resolution is ${width} x ${height} pixels. Strictly compose according to this aspect ratio.`)
  }

  if (quality === 'high') {
    hints.push('Use high quality rendering with rich details, sharp textures, coherent lighting, and polished final composition.')
  }

  return hints.length ? `${prompt}\n\n${hints.join('\n')}` : prompt
}
