'use client'

import { Drawer } from '@heroui/react'
import { History, Pencil, TextCursorInput, X } from 'lucide-react'
import {
  previewMediaTask,
  reusePrompt,
  selectSelectedHistory,
  setCurrentTask,
  setHistoryPanelOpen,
  studioStore
} from '@/lib/studio/tasks-store'

/** 编辑历史侧滑面板：从最初生成到当前选中图片的编辑链路 */
export function EditHistoryPanel() {
  const state = studioStore.useStore()
  const open = state.historyPanelOpen
  const selectedHistory = selectSelectedHistory(state)

  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={setHistoryPanelOpen} className="bg-black/40 backdrop-blur-sm">
      <Drawer.Content placement="right" className="p-3">
        <Drawer.Dialog
          aria-label="编辑历史"
          className="glass-panel glass-panel--lg w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-3xl p-0"
        >
          <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-bold">编辑历史</h2>
              <p className="mt-0.5 text-xs opacity-60">从最初生成到当前选中图片的编辑链路</p>
            </div>
            <button type="button" aria-label="关闭" className="glass-pill p-1.5" onClick={() => setHistoryPanelOpen(false)}>
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {selectedHistory.length
              ? (
                  <div className="flex flex-col gap-3">
                    {selectedHistory.map((item, index) => (
                      <div
                        key={item.id}
                        className={`glass-panel overflow-hidden rounded-2xl ${item.id === state.selectedTaskId ? 'ring-2 ring-(--app-primary)' : ''}`}
                      >
                        <button type="button" className="block w-full" onClick={() => previewMediaTask(item)}>
                          {item.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.prompt} className="aspect-video w-full object-cover" />
                          )}
                        </button>
                        <div className="space-y-2 p-3">
                          <p className="label-mono">
                            第 {index + 1} 步 · {item.type === 'edit' ? '编辑' : '生成'}
                          </p>
                          <p className="line-clamp-2 text-xs opacity-60">{item.prompt}</p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              className="glass-pill flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                              onClick={() => reusePrompt(item)}
                            >
                              <TextCursorInput className="size-3.5" />
                              复用提示词
                            </button>
                            <button
                              type="button"
                              disabled={item.id === state.selectedTaskId || !item.imageUrl}
                              className="glass-pill flex items-center gap-1 px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => setCurrentTask(item)}
                            >
                              <Pencil className="size-3.5" />
                              设为当前
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <History className="size-8 opacity-50" />
                    <p className="text-sm opacity-60">先在结果里选中一张图片，这里会展示它的编辑链路。</p>
                  </div>
                )}
          </div>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
