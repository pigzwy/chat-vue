'use client'

// 会话级视频 blob 缓存:切换视图会重建 <video> 组件,若直连远程 URL 每次都重新拉流。
// 命中缓存的挂载直接用 blob URL,秒开零网络。
//
// 预热是**按需**的:进创作台就把历史里每个视频整段拉下来,12 条就是几十上百 MB,
// 而用户可能一条都不点。改为只在有播放意图时(悬停预览 / 点开全屏 / 真正播放)预热,
// 并限制同时预热路数,避免挤占首屏带宽。
import { useEffect, useState } from 'react'

interface CacheEntry {
  source: string
  url: string
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, string>()
const order: string[] = []
const cacheLimit = 12
/** 同时预热的最大路数:视频动辄几十 MB,并发拉会把弱网首屏挤死 */
const maxConcurrentWarm = 2
const pending: Array<{ taskId: string, videoUrl: string }> = []

function evictIfNeeded() {
  while (order.length > cacheLimit) {
    const oldest = order.shift()
    if (!oldest) break
    const entry = cache.get(oldest)
    if (entry) URL.revokeObjectURL(entry.url)
    cache.delete(oldest)
  }
}

function pumpQueue() {
  while (inflight.size < maxConcurrentWarm && pending.length) {
    const next = pending.shift()
    if (!next) break
    if (cache.get(next.taskId)?.source === next.videoUrl) continue
    startWarm(next.taskId, next.videoUrl)
  }
}

function startWarm(taskId: string, videoUrl: string) {
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
      pumpQueue()
    })
}

/** 声明「这条视频用户要看了」,后台把它拉成 blob 供下次挂载秒开。
 *  由悬停预览 / 打开全屏 / 开始播放触发,不在挂载时无条件调用。 */
export function warmCachedVideo(taskId: string, videoUrl: string | undefined) {
  if (!videoUrl) return
  if (cache.get(taskId)?.source === videoUrl || inflight.get(taskId) === videoUrl) return
  if (pending.some(item => item.taskId === taskId && item.videoUrl === videoUrl)) return

  pending.push({ taskId, videoUrl })
  pumpQueue()
}

/** 删除任务时释放对应缓存 */
export function dropCachedVideo(taskId: string) {
  const entry = cache.get(taskId)
  if (entry) URL.revokeObjectURL(entry.url)
  cache.delete(taskId)
  const index = order.indexOf(taskId)
  if (index !== -1) order.splice(index, 1)
}

/** 离开创作台时整体释放:blob 每段几十 MB,留着会被 SPA 整个会话持有 */
export function clearVideoCache() {
  for (const entry of cache.values()) URL.revokeObjectURL(entry.url)
  cache.clear()
  order.length = 0
  inflight.clear()
  pending.length = 0
}

function resolveEntry(taskId: string, videoUrl: string | undefined): CacheEntry | null {
  if (!videoUrl) return null
  const hit = cache.get(taskId)
  return { source: videoUrl, url: hit?.source === videoUrl ? hit.url : videoUrl }
}

/** 已有 blob 缓存则返回之,否则返回原始地址(直接播,不预先整段下载)。
 *  同一地址在本次挂载内不换源(预热完成不打断正在播放的流);
 *  地址从无到有(生成中→完成的同一挂载)或换新(重试)时立即跟进,
 *  否则 <video> 会一直抱着挂载瞬间的空地址,表现为"要刷新页面才播得出来"。
 *  eager=true 用于用户已明确打开的场景(如全屏预览)。 */
export function useCachedVideoUrl(
  taskId: string,
  videoUrl: string | undefined,
  options: { eager?: boolean } = {}
) {
  const [entry, setEntry] = useState(() => resolveEntry(taskId, videoUrl))
  const { eager = false } = options

  // 渲染期受控调整(React 官方「adjusting state when props change」写法):
  // 来源地址变了才重算,同源渲染直接复用,避免 effect 迟一帧导致空 src
  if ((entry?.source ?? null) !== (videoUrl ?? null)) {
    setEntry(resolveEntry(taskId, videoUrl))
  }

  useEffect(() => {
    if (eager) warmCachedVideo(taskId, videoUrl)
  }, [taskId, videoUrl, eager])

  return entry?.url ?? ''
}
