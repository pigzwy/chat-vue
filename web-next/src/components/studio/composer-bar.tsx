'use client'

import { useEffect, useRef } from 'react'
import { ArrowUp, Coins, History, ImagePlus, X } from 'lucide-react'
import { resolveMediaModelSpec, videoResolutions } from '@/lib/shared/media-models'
import { mediaModelsStore } from '@/lib/studio/media-models-store'
import {
  appendUploadedImages,
  clearSelectedTask,
  currentUploadLimit,
  getTaskNumber,
  previewMediaTask,
  previewUploadedSource,
  promptLimit,
  removeUploadedImage,
  selectEstimatedCost,
  selectPromptPlaceholder,
  selectSelectedTask,
  selectSubmitLabel,
  setHistoryPanelOpen,
  setPrompt,
  setRatio,
  setVideoDuration,
  setVideoResolution,
  studioStore,
  submitStudioTask
} from '@/lib/studio/tasks-store'
import { ModeTabs } from './mode-tabs'
import { MediaModelMenu } from './media-model-menu'
import { RatioResolutionPopover } from './ratio-resolution-popover'
import { QualityPopover } from './quality-popover'

const durationOptions = [5, 10, 15]

/** 底部创作输入栏：模式 / 模型 / 参数 / 源图 / prompt / 提交 */
export function ComposerBar() {
  const state = studioStore.useStore()
  const models = mediaModelsStore.useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isVideo = models.mediaMode === 'video'
  const imageSpec = resolveMediaModelSpec(models.imageModel)
  const videoSpec = resolveMediaModelSpec(models.videoModel)
  const selectedTask = selectSelectedTask(state)
  const showEditingChip = Boolean(selectedTask) && !state.files.length
  const uploadLimit = currentUploadLimit()
  const uploadDisabled = state.files.length >= uploadLimit
  const canSubmit = state.prompt.trim().length > 0
  const submitLabel = selectSubmitLabel(state)
  const estimatedCost = selectEstimatedCost(state)
  const costText = estimatedCost == null ? '' : `$${(+estimatedCost).toFixed(3).replace(/\.?0+$/, '')}`
  const availableDurations = durationOptions.filter(option => option <= (videoSpec.maxDurationSeconds ?? Infinity))

  // 切到比例集合更小的模型（grok）时，把越界的已选比例回退到 Auto，避免上游 422
  useEffect(() => {
    const allowed = resolveMediaModelSpec(models.imageModel).supportedAspectRatios
    if (allowed && state.ratio !== 'Auto' && !allowed.includes(state.ratio)) {
      setRatio('Auto')
    }
  }, [models.imageModel, state.ratio])

  // 高度跟随内容（含 store 外部写入 prompt 的场景：预设 / 复用提示词 / 提交后清空）
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    if (state.prompt) {
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }, [state.prompt])

  function onSubmit() {
    if (!studioStore.get().prompt.trim()) return
    void submitStudioTask()
  }

  function onPromptKeydown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  function onFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    void appendUploadedImages(Array.from(event.target.files || []).filter(file => file.type.startsWith('image/')))
    event.target.value = ''
  }

  return (
    <div className="glass-input p-3">
      {showEditingChip && selectedTask && (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className="glass-pill is-selected inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold"
            onClick={() => previewMediaTask(selectedTask)}
          >
            {selectedTask.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedTask.imageUrl} alt="" className="size-5 rounded-md object-cover" />
            )}
            正在编辑 {getTaskNumber(state, selectedTask)}
          </button>
          <button
            type="button"
            className="glass-pill inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
            onClick={() => setHistoryPanelOpen(true)}
          >
            <History className="size-3.5" />
            编辑历史
          </button>
          <button
            type="button"
            aria-label="取消编辑"
            className="glass-pill p-1.5"
            onClick={() => clearSelectedTask()}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {state.files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {state.files.map(file => (
            <div
              key={file.id}
              className="group relative size-14 shrink-0 overflow-hidden rounded-xl border border-black/10 dark:border-white/10"
            >
              <button type="button" className="block size-full" onClick={() => previewUploadedSource(file)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.previewUrl} alt={file.name} className="size-full object-cover" />
              </button>
              <button
                type="button"
                aria-label="移除源图"
                className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                onClick={() => removeUploadedImage(file.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={state.prompt}
        rows={2}
        maxLength={promptLimit}
        placeholder={selectPromptPlaceholder(state)}
        className="w-full resize-none bg-transparent p-1 text-base outline-none placeholder:opacity-50"
        onChange={event => setPrompt(event.target.value)}
        onKeyDown={onPromptKeydown}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-2.5 dark:border-white/10">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <ModeTabs />

          <MediaModelMenu />

          {!isVideo
            ? (
                <>
                  <RatioResolutionPopover />
                  {imageSpec.supportsSizeQuality && <QualityPopover />}
                </>
              )
            : (
                <>
                  <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/5 p-0.5 dark:bg-white/5">
                    {availableDurations.map(option => (
                      <button
                        key={option}
                        type="button"
                        data-selected={state.videoDuration === option}
                        className="glass-pill h-7 rounded-full px-2.5 text-xs font-semibold"
                        onClick={() => setVideoDuration(option)}
                      >
                        {option}s
                      </button>
                    ))}
                  </div>
                  {videoSpec.supportsVideoResolution && (
                    <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/5 p-0.5 dark:bg-white/5">
                      {videoResolutions.map(option => (
                        <button
                          key={option}
                          type="button"
                          data-selected={state.videoResolution === option}
                          className="glass-pill h-7 rounded-full px-2.5 text-xs font-semibold"
                          onClick={() => setVideoResolution(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

          <input
            ref={fileInputRef}
            type="file"
            multiple={!isVideo}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFilesChange}
          />
          <button
            type="button"
            aria-label="上传图片"
            title={isVideo ? '上传源图（图生视频）' : '上传参考图（以图生图）'}
            disabled={uploadDisabled}
            className="glass-pill flex h-8 shrink-0 items-center gap-1 px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {state.files.length > 0 && `${state.files.length}/${uploadLimit}`}
          </button>

          {costText && (
            <span className="label-mono inline-flex shrink-0 items-center gap-1">
              <Coins className="size-3" />
              ≈ {costText}
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label={submitLabel}
          title={`${submitLabel}（Ctrl+Enter）`}
          disabled={!canSubmit}
          className="glass-btn flex size-9 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onSubmit}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )
}
