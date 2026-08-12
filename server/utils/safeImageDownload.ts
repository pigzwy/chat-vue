import { Buffer } from 'node:buffer'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * 服务端远程图片安全下载:把上游返回的临时直链(xAI 直链 / S3 预签名)拉成 base64。
 * 加固点(相对旧版 fetch+arrayBuffer):
 * - SSRF:仅 https;每一跳(含重定向)对主机名做 DNS 解析并拒绝私网/保留段 IP;
 *   重定向手动跟随并逐跳复验。已知局限:校验与实际连接之间存在 DNS TOCTOU 窗口,
 *   URL 来源是自家网关响应,此级别防护针对误配/上游被篡改场景。
 * - 大小:Content-Length 预检 + 流式累计上限,超限立即中断(不再全量下载后检查)。
 * - 类型:Content-Type 允许列表 + 首块魔数嗅探双重校验,以魔数为准。
 */

export interface SafeImageDownloadOptions {
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  fetchImpl?: typeof fetch
  lookupImpl?: (hostname: string) => Promise<Array<{ address: string, family: number }>>
  signal?: AbortSignal
}

export interface SafeImageDownloadResult {
  base64: string
  mimeType: string
  bytes: number
}

const defaultMaxBytes = 20 * 1024 * 1024
const defaultTimeoutMs = 60 * 1000
const defaultMaxRedirects = 3

const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function sniffImageMime(head: Buffer): string | null {
  if (head.length >= 8
    && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return 'image/png'
  if (head.length >= 3 && head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'image/jpeg'
  if (head.length >= 12
    && head.subarray(0, 4).toString('ascii') === 'RIFF'
    && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (head.length >= 6) {
    const tag = head.subarray(0, 6).toString('ascii')
    if (tag === 'GIF87a' || tag === 'GIF89a') return 'image/gif'
  }
  return null
}

function isPrivateIPv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return true
  const [a, b] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || a >= 224 // 组播/保留
}

function isPrivateIPv6(address: string) {
  const lower = address.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true // fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7
  // IPv4 映射(::ffff:a.b.c.d)按 IPv4 规则判
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

export function isPrivateAddress(address: string, family: number) {
  return family === 6 || address.includes(':') ? isPrivateIPv6(address) : isPrivateIPv4(address)
}

async function assertPublicHost(
  url: URL,
  lookupImpl: NonNullable<SafeImageDownloadOptions['lookupImpl']>
) {
  if (url.protocol !== 'https:') {
    throw new Error(`图片下载仅允许 https:${url.protocol}`)
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const literalFamily = isIP(hostname)
  if (literalFamily) {
    if (isPrivateAddress(hostname, literalFamily)) {
      throw new Error('图片下载目标为私网地址,已拒绝')
    }
    return
  }

  const addresses = await lookupImpl(hostname)
  if (!addresses.length) {
    throw new Error(`图片下载域名无法解析:${hostname}`)
  }
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new Error('图片下载域名解析到私网地址,已拒绝')
    }
  }
}

async function defaultLookup(hostname: string) {
  return dnsLookup(hostname, { all: true })
}

/** 下载远程图片为 base64;所有校验失败/超限均抛错(由调用方决定回退策略) */
export async function downloadImageAsBase64(
  rawUrl: string,
  options: SafeImageDownloadOptions = {}
): Promise<SafeImageDownloadResult> {
  const maxBytes = options.maxBytes ?? defaultMaxBytes
  const maxRedirects = options.maxRedirects ?? defaultMaxRedirects
  const fetchImpl = options.fetchImpl ?? fetch
  const lookupImpl = options.lookupImpl ?? defaultLookup

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultTimeoutMs)
  const onOuterAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onOuterAbort, { once: true })

  try {
    let url = new URL(rawUrl)
    let response: Response | null = null

    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertPublicHost(url, lookupImpl)
      response = await fetchImpl(url.toString(), { redirect: 'manual', signal: controller.signal })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`图片下载重定向缺少 Location(${response.status})`)
        if (hop === maxRedirects) throw new Error('图片下载重定向次数过多')
        url = new URL(location, url)
        // 消费/丢弃 body,避免连接悬挂
        await response.body?.cancel().catch(() => {})
        continue
      }
      break
    }

    if (!response) throw new Error('图片下载无响应')
    if (!response.ok) throw new Error(`图片下载失败:HTTP ${response.status}`)

    const declaredLength = Number(response.headers.get('content-length') || '')
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`图片超出大小上限(${Math.round(declaredLength / 1024 / 1024)}MB > ${Math.round(maxBytes / 1024 / 1024)}MB)`)
    }

    const headerMime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
    if (headerMime && !headerMime.startsWith('image/') && headerMime !== 'application/octet-stream' && headerMime !== 'binary/octet-stream') {
      await response.body?.cancel().catch(() => {})
      throw new Error(`图片下载返回非图片类型:${headerMime}`)
    }

    if (!response.body) throw new Error('图片下载没有响应体')

    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let total = 0
    while (true) {
      const { value, done } = await reader.read()
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => {})
          throw new Error(`图片超出大小上限(>${Math.round(maxBytes / 1024 / 1024)}MB)`)
        }
        chunks.push(Buffer.from(value))
      }
      if (done) break
    }

    const buffer = Buffer.concat(chunks)
    if (!buffer.byteLength) throw new Error('图片下载内容为空')

    const sniffedMime = sniffImageMime(buffer.subarray(0, 16))
    if (!sniffedMime || !allowedMimeTypes.has(sniffedMime)) {
      throw new Error('图片内容校验失败(魔数不匹配 png/jpeg/webp/gif)')
    }

    return {
      base64: buffer.toString('base64'),
      mimeType: sniffedMime,
      bytes: buffer.byteLength
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }
}
