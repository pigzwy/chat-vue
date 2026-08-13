'use client'

import { useState } from 'react'
import { Modal } from '@heroui/react'
import { CloudDownload, History, ImageOff, LoaderCircle, TextCursorInput } from 'lucide-react'
import { expiryText, fetchCloudHistory, type CloudHistoryItem } from '@/lib/studio/cloud-history'
import { setPrompt } from '@/lib/studio/tasks-store'
import { toast } from '@/lib/toast'

const pageSize = 60

/** 云端历史(账号级):服务端存的 URL+过期时间清单;本设备图仍以本地缓存为准 */
export function CloudHistoryPanel() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<CloudHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  // 渲染期不可调 Date.now(react-hooks/purity):加载时快照当前时间供过期判断
  const [now, setNow] = useState(0)

  async function load(before?: number) {
    setLoading(true)
    setNow(Date.now())
    try {
      const { items: page } = await fetchCloudHistory({ before, limit: pageSize })
      setItems(prev => before ? [...prev, ...page] : page)
      setHasMore(page.length === pageSize)
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : '历史加载失败', color: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function openPanel() {
    setOpen(true)
    void load()
  }

  function reuse(item: CloudHistoryItem) {
    setPrompt(item.prompt)
    setOpen(false)
    toast({ description: '提示词已带入创作栏' })
  }

  return (
    <>
      <button
        type="button"
        aria-label="云端历史"
        title="云端历史(账号级,图片链接约 7 天有效)"
        className="glass-pill flex size-7 items-center justify-center rounded-full"
        onClick={openPanel}
      >
        <History className="size-3.5" />
      </button>

      <Modal.Backdrop isOpen={open} onOpenChange={setOpen} className="bg-black/30 backdrop-blur-sm">
        <Modal.Container placement="center" className="sm:w-full sm:p-4">
          <Modal.Dialog aria-label="云端历史" className="glass-panel glass-panel--lg flex max-h-[80vh] w-full max-w-2xl flex-col rounded-3xl p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">云端历史</h2>
                <p className="mt-0.5 text-xs leading-5 opacity-55">
                  跟账号走的生成记录(经 S3 转存的图片/视频)。链接约 7 天有效,过期后可用提示词重新生成;本设备的内容不受影响。
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {items.map((item) => {
                const expired = item.expiresAt <= now
                return (
                  <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-black/[0.03] p-2.5 dark:bg-white/[0.05]">
                    {expired
                      ? (
                          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10">
                            <ImageOff className="size-5 opacity-40" />
                          </div>
                        )
                      : item.kind === 'video'
                        ? (
                            <video
                              src={item.imageUrl}
                              muted
                              playsInline
                              preload="metadata"
                              className="size-16 shrink-0 rounded-xl bg-black/20 object-cover"
                            />
                          )
                        : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.prompt}
                              loading="lazy"
                              decoding="async"
                              className="size-16 shrink-0 rounded-xl object-cover"
                            />
                          )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs leading-5">{item.prompt}</p>
                      <p className="label-mono mt-1 text-[10px] opacity-50">
                        {item.model}
                        {item.costUsd ? ` · $${item.costUsd.toFixed(3).replace(/\.?0+$/, '')}` : ''}
                        {' · '}
                        <span className={expired ? 'text-red-500/80' : ''}>{expiryText(item.expiresAt, now)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {!expired && (
                        <a
                          href={item.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="打开原文件"
                          title="打开原文件"
                          className="glass-pill p-1.5"
                        >
                          <CloudDownload className="size-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        aria-label="复用提示词"
                        title="复用提示词"
                        className="glass-pill p-1.5"
                        onClick={() => reuse(item)}
                      >
                        <TextCursorInput className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}

              {!loading && !items.length && (
                <p className="py-10 text-center text-sm opacity-50">
                  还没有云端记录——开启异步生图后的生成会自动归档到账号
                </p>
              )}

              {loading && (
                <div className="flex justify-center py-6">
                  <LoaderCircle className="size-5 animate-spin opacity-50" />
                </div>
              )}

              {!loading && hasMore && (
                <button
                  type="button"
                  className="glass-pill mx-auto block px-4 py-1.5 text-xs font-semibold"
                  onClick={() => { void load(items[items.length - 1]?.createdAt) }}
                >
                  加载更多
                </button>
              )}
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
