'use client'

// 会话级视频 blob 缓存:切换视图会重建 <video> 组件,若直连远程 URL 每次都重新拉流。
// 首次挂载先用原始 URL 立即播放,后台把整段拉成 blob;之后的挂载直接用 blob URL,秒开零网络。
// 缓存按「任务 id + 来源地址」配对:重试产出新地址时旧 blob 视为失效,不会串台。
import { useEffect, useState } from 'react'

interface CacheEntry {
  source: string
  url: string
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, string>()
const order: string[] = []
const cacheLimit = 12

function evictIfNeeded() {
  while (order.length > cacheLimit) {
    const oldest = order.shift()
    if (!oldest) break
    const entry = cache.get(oldest)
    if (entry) URL.revokeObjectURL(entry.url)
    cache.delete(oldest)
  }
}

function warm(taskId: string, videoUrl: string) {
  if (cache.get(taskId)?.source === videoUrl || inflight.get(taskId) === videoUrl) return
  inflight.set(taskId, videoUrl)
  void fetch(videoUrl)
    .then(async (response) => {
      if (!response.ok) return
      const blob = await response.blob()
      if (!blob.size) return
      // 期间换了新地址(重试)则丢弃这份旧结果
      if (inflight.get(taskId) !== videoUrl) return
      dropCachedVideo(taskId)
      cache.set(taskId, { source: videoUrl, url: URL.createObjectURL(blob) })
      order.push(taskId)
      evictIfNeeded()
    })
    .catch(() => {})
    .finally(() => {
      if (inflight.get(taskId) === videoUrl) inflight.delete(taskId)
    })
}

/** 删除任务时释放对应缓存 */
export function dropCachedVideo(taskId: string) {
  const entry = cache.get(taskId)
  if (entry) URL.revokeObjectURL(entry.url)
  cache.delete(taskId)
  const index = order.indexOf(taskId)
  if (index !== -1) order.splice(index, 1)
}

function resolveEntry(taskId: string, videoUrl: string | undefined): CacheEntry | null {
  if (!videoUrl) return null
  const hit = cache.get(taskId)
  return { source: videoUrl, url: hit?.source === videoUrl ? hit.url : videoUrl }
}

/** 已有 blob 缓存则返回之,否则返回原始 URL 并后台预热。
 *  同一地址在本次挂载内不换源(warm 完成不打断正在播放的流);
 *  地址从无到有(生成中→完成的同一挂载)或换新(重试)时立即跟进,
 *  否则 <video> 会一直抱着挂载瞬间的空地址,表现为"要刷新页面才播得出来" */
export function useCachedVideoUrl(taskId: string, videoUrl: string | undefined) {
  const [entry, setEntry] = useState(() => resolveEntry(taskId, videoUrl))

  // 渲染期受控调整(React 官方「adjusting state when props change」写法):
  // 来源地址变了才重算,同源渲染直接复用,避免 effect 迟一帧导致空 src
  if ((entry?.source ?? null) !== (videoUrl ?? null)) {
    setEntry(resolveEntry(taskId, videoUrl))
  }

  useEffect(() => {
    if (videoUrl) warm(taskId, videoUrl)
  }, [taskId, videoUrl])

  return entry?.url ?? ''
}
