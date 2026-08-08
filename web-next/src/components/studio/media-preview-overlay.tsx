'use client'

import { useState } from 'react'
import { Modal } from '@heroui/react'
import { Clapperboard, Copy, Download, Paperclip, TextCursorInput, TimerOff, X } from 'lucide-react'
import {
  addTaskImageAsReference,
  closePreview,
  copyImage,
  copyRevisedPrompt,
  downloadMediaTask,
  reusePrompt,
  startVideoFromTask,
  studioStore
} from '@/lib/studio/tasks-store'

const outlineBtnClass = 'glass-pill flex items-center gap-1.5 border border-black/10 px-3 py-1.5 text-xs font-semibold dark:border-white/15'

/** 图片 / 视频 / 上传源图大图预览浮层（Esc / 点遮罩关闭） */
export function MediaPreviewOverlay() {
  const state = studioStore.useStore()
  const previewTask = state.previewTask
  const previewUploadedImage = state.previewUploadedImage
  const open = Boolean(previewTask || previewUploadedImage)

  const previewVideoUrl = previewTask?.videoUrl || ''
  const previewImageUrl = previewTask?.imageUrl || previewUploadedImage?.previewUrl || ''
  const previewRevisedPrompt = previewTask?.revisedPrompt?.trim() || ''

  // 视频源变化时重置失效标记（记录失败的 URL，替代 Vue 的 watch 复位）
  const [failedVideoUrl, setFailedVideoUrl] = useState('')
  const videoFailed = Boolean(previewVideoUrl) && failedVideoUrl === previewVideoUrl

  if (!open) return null

  const title = previewTask ? (previewTask.kind === 'video' ? '视频预览' : '图片预览') : '源图预览'

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(value) => { if (!value) closePreview() }}
      className="bg-black/40 backdrop-blur-sm"
    >
      <Modal.Container placement="center" className="w-full max-w-5xl sm:w-full sm:p-4">
        <Modal.Dialog aria-label={title} className="glass-panel glass-panel--lg w-full overflow-hidden rounded-3xl p-0">
          <div className="flex max-h-[calc(100vh-3rem)] flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-semibold">
                {title}
                {previewTask && <span className="label-mono ml-2">{previewTask.model}</span>}
              </p>
              <button type="button" aria-label="关闭" className="glass-pill p-1.5" onClick={() => closePreview()}>
                <X className="size-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-black/85 p-2">
              {previewVideoUrl && videoFailed
                ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-white/70">
                      <TimerOff className="size-8" />
                      <p className="text-sm">视频已过期，请重新生成</p>
                    </div>
                  )
                : previewVideoUrl
                  ? (
                      <video
                        src={previewVideoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        className="max-h-[62vh] max-w-full rounded-xl"
                        onError={() => setFailedVideoUrl(previewVideoUrl)}
                      />
                    )
                  : previewImageUrl
                    ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewImageUrl}
                          alt={previewTask?.revisedPrompt || previewTask?.prompt || previewUploadedImage?.name || ''}
                          className="max-h-[62vh] max-w-full rounded-xl object-contain"
                        />
                      )
                    : null}
            </div>

            <div className="space-y-3 px-4 py-3">
              {previewTask?.prompt && <p className="line-clamp-2 text-xs opacity-60">{previewTask.prompt}</p>}

              {previewRevisedPrompt && (
                <div className="rounded-xl border border-black/5 bg-black/[0.03] p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="label-mono">模型描述</p>
                    <button
                      type="button"
                      aria-label="复制模型描述"
                      className="glass-pill p-1.5"
                      onClick={() => { void copyRevisedPrompt(previewRevisedPrompt) }}
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                  <p className="max-h-24 overflow-y-auto text-xs leading-5 whitespace-pre-wrap opacity-60">
                    {previewRevisedPrompt}
                  </p>
                </div>
              )}

              {previewTask && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {previewTask.kind === 'image' && (
                    <>
                      <button type="button" className={outlineBtnClass} onClick={() => startVideoFromTask(previewTask)}>
                        <Clapperboard className="size-3.5" />
                        生成视频
                      </button>
                      <button
                        type="button"
                        className={outlineBtnClass}
                        onClick={() => { void addTaskImageAsReference(previewTask) }}
                      >
                        <Paperclip className="size-3.5" />
                        加入参考图
                      </button>
                      <button type="button" className={outlineBtnClass} onClick={() => { void copyImage(previewTask) }}>
                        <Copy className="size-3.5" />
                        复制图片
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={outlineBtnClass}
                    onClick={() => {
                      reusePrompt(previewTask)
                      closePreview()
                    }}
                  >
                    <TextCursorInput className="size-3.5" />
                    复用提示词
                  </button>
                  <button
                    type="button"
                    className="glass-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                    onClick={() => { void downloadMediaTask(previewTask) }}
                  >
                    <Download className="size-3.5" />
                    下载
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
