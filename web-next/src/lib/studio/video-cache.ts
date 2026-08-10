'use client'

// 会话级视频 blob 缓存:切换视图会重建 <video> 组件,若直连代理 URL 每次都重新拉流。
// 首次挂载先用原始 URL 立即播放,后台把整段拉成 blob;之后的挂载直接用 blob URL,秒开零网络。
import { useEffect, useState } from 'react'

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<void>>()
const order: string[] = []
const cacheLimit = 12

function evictIfNeeded() {
  while (order.length > cacheLimit) {
    const oldest = order.shift()
    if (!oldest) break
    const url = cache.get(oldest)
    if (url) URL.revokeObjectURL(url)
    cache.delete(oldest)
  }
}

function warm(taskId: string, videoUrl: string) {
  if (cache.has(taskId) || inflight.has(taskId)) return inflight.get(taskId)
  const job = fetch(videoUrl)
    .then(async (response) => {
      if (!response.ok) return
      const blob = await response.blob()
      if (!blob.size) return
      cache.set(taskId, URL.createObjectURL(blob))
      order.push(taskId)
      evictIfNeeded()
    })
    .catch(() => {})
    .finally(() => inflight.delete(taskId))
  inflight.set(taskId, job)
  return job
}

/** 删除任务时释放对应缓存 */
export function dropCachedVideo(taskId: string) {
  const url = cache.get(taskId)
  if (url) URL.revokeObjectURL(url)
  cache.delete(taskId)
  const index = order.indexOf(taskId)
  if (index !== -1) order.splice(index, 1)
}

/** 已有 blob 缓存则返回之,否则返回原始 URL 并后台预热。
 *  本次挂载不换源(避免播放中断),下次挂载(如切换视图)自然命中 blob 秒开 */
export function useCachedVideoUrl(taskId: string, videoUrl: string | undefined) {
  const [url] = useState(() => (videoUrl ? cache.get(taskId) ?? videoUrl : ''))

  useEffect(() => {
    if (!videoUrl || cache.has(taskId)) return
    void warm(taskId, videoUrl)
  }, [taskId, videoUrl])

  return url
}
