'use client'

import { useCachedVideoUrl } from '@/lib/studio/video-cache'
import { useState } from 'react'
import { Modal } from '@heroui/react'
import { Clapperboard, Copy, Download, FileText, Paperclip, TextCursorInput, TimerOff, X } from 'lucide-react'
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

const darkBtnClass = 'flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/20'

/** 全屏灯箱预览:媒体吃满视口,信息与操作浮层化(Esc / 点空白关闭) */
export function MediaPreviewOverlay() {
  const state = studioStore.useStore()
  const previewTask = state.previewTask
  const previewUploadedImage = state.previewUploadedImage
  const open = Boolean(previewTask || previewUploadedImage)

  const previewVideoUrl = previewTask?.videoUrl || ''
  const cachedPreviewVideo = useCachedVideoUrl(previewTask?.id || '', previewTask?.videoUrl)
  const previewImageUrl = previewTask?.imageUrl || previewUploadedImage?.previewUrl || ''
  const previewRevisedPrompt = previewTask?.revisedPrompt?.trim() || ''

  // 视频源变化时重置失效标记（记录失败的 URL，替代 Vue 的 watch 复位）
  const [failedVideoUrl, setFailedVideoUrl] = useState('')
  const [showRevised, setShowRevised] = useState(false)
  const videoFailed = Boolean(previewVideoUrl) && failedVideoUrl === previewVideoUrl

  if (!open) return null

  const title = previewTask ? (previewTask.kind === 'video' ? '视频预览' : '图片预览') : '源图预览'

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(value) => { if (!value) closePreview() }}
      className="bg-black/85 backdrop-blur-md"
    >
      <Modal.Container placement="center" className="h-full w-full max-w-none p-0 sm:p-0">
        <Modal.Dialog
          aria-label={title}
          className="relative flex h-dvh w-screen max-w-none items-center justify-center bg-transparent p-0 outline-none"
        >
          {/* 点媒体之外的空白关闭 */}
          <div className="absolute inset-0" onClick={() => closePreview()} />

          {/* 顶部浮层:标题/模型 + 关闭 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
            <p className="rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              {title}
              {previewTask && <span className="label-mono ml-2 text-white/60 uppercase">{previewTask.model}</span>}
            </p>
            <button
              type="button"
              aria-label="关闭"
              className="pointer-events-auto rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-white/20"
              onClick={() => closePreview()}
            >
              <X className="size-4.5" />
            </button>
          </div>

          {/* 媒体主体:吃满视口(顶/底浮层各留一条) */}
          <div className="relative z-[5] flex max-h-[calc(100dvh-8.5rem)] max-w-[96vw] items-center justify-center">
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
                      src={cachedPreviewVideo || previewVideoUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                      className="max-h-[calc(100dvh-8.5rem)] max-w-full rounded-lg shadow-2xl"
                      onError={() => setFailedVideoUrl(previewVideoUrl)}
                    />
                  )
                : previewImageUrl
                  ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewImageUrl}
                        alt={previewTask?.revisedPrompt || previewTask?.prompt || previewUploadedImage?.name || ''}
                        className="max-h-[calc(100dvh-8.5rem)] max-w-full rounded-lg object-contain shadow-2xl"
                      />
                    )
                  : null}
          </div>

          {/* 模型描述抽屉(按需展开) */}
          {showRevised && previewRevisedPrompt && (
            <div className="absolute inset-x-0 bottom-16 z-10 mx-auto max-w-2xl px-4">
              <div className="rounded-2xl bg-black/70 p-3 backdrop-blur">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="label-mono text-white/60">模型描述</p>
                  <button
                    type="button"
                    aria-label="复制模型描述"
                    className="rounded-full p-1.5 text-white/70 transition hover:bg-white/15"
                    onClick={() => { void copyRevisedPrompt(previewRevisedPrompt) }}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <p className="max-h-36 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-white/80">
                  {previewRevisedPrompt}
                </p>
              </div>
            </div>
          )}

          {/* 底部浮层:提示词 + 操作 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 p-4">
            <p className="max-w-[38%] truncate text-xs text-white/60">
              {previewTask?.prompt || previewUploadedImage?.name || ''}
            </p>
            {previewTask && (
              <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5">
                {previewRevisedPrompt && (
                  <button
                    type="button"
                    data-selected={showRevised}
                    className={`${darkBtnClass} data-selected:bg-white/25`}
                    onClick={() => setShowRevised(value => !value)}
                  >
                    <FileText className="size-3.5" />
                    模型描述
                  </button>
                )}
                {previewTask.kind === 'image' && (
                  <>
                    <button type="button" className={darkBtnClass} onClick={() => startVideoFromTask(previewTask)}>
                      <Clapperboard className="size-3.5" />
                      生成视频
                    </button>
                    <button
                      type="button"
                      className={darkBtnClass}
                      onClick={() => { void addTaskImageAsReference(previewTask) }}
                    >
                      <Paperclip className="size-3.5" />
                      加入参考图
                    </button>
                    <button type="button" className={darkBtnClass} onClick={() => { void copyImage(previewTask) }}>
                      <Copy className="size-3.5" />
                      复制图片
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={darkBtnClass}
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
                  className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-black transition hover:bg-white/90"
                  onClick={() => { void downloadMediaTask(previewTask) }}
                >
                  <Download className="size-3.5" />
                  下载
                </button>
              </div>
            )}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
