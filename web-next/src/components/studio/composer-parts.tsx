'use client'

import { useEffect, useRef } from 'react'
import { Coins, History, ImagePlus, X } from 'lucide-react'
import { resolveMediaModelSpec, type MediaModelSpec } from '@/lib/shared/media-models'
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
  selectPromptPlaceholder,
  selectSelectedTask,
  setHistoryPanelOpen,
  setPrompt,
  setRatio,
  studioStore,
  submitStudioTask
} from '@/lib/studio/tasks-store'

// ---------------------------------------------------------------------------
// ComposerBar（底部创作栏）的逻辑与小组件抽取，
// 两种形态只负责摆放，行为（门控 / 上限 / 提交）都收敛在这里，避免两份实现漂移。
// ---------------------------------------------------------------------------

const durationOptions = [5, 10, 15]

/** 按当前视频模型的最大时长过滤可选档位 */
export function availableVideoDurations(spec: MediaModelSpec) {
  return durationOptions.filter(option => option <= (spec.maxDurationSeconds ?? Infinity))
}

/** 提交当前输入（空 prompt 直接忽略） */
export function submitComposer() {
  if (!studioStore.get().prompt.trim()) return
  void submitStudioTask()
}

/** 预设提示词追加进当前 prompt（已有内容时用中文逗号衔接） */
export function appendPresetPrompt(presetPrompt: string) {
  const current = studioStore.get().prompt.trim()
  setPrompt(current ? `${current}，${presetPrompt}` : presetPrompt)
}

/** 切到比例集合更小的模型（grok）时，把越界的已选比例回退到 Auto，避免上游 422 */
export function useRatioWhitelistGuard() {
  const { imageModel } = mediaModelsStore.useStore()
  const { ratio } = studioStore.useStore()

  useEffect(() => {
    const allowed = resolveMediaModelSpec(imageModel).supportedAspectRatios
    if (allowed && ratio !== 'Auto' && !allowed.includes(ratio)) {
      setRatio('Auto')
    }
  }, [imageModel, ratio])
}

/** 「正在编辑 N / 编辑历史 / 取消」提示行（选中任务且未上传源图时显示） */
export function EditingChipRow({ className }: { className?: string }) {
  const state = studioStore.useStore()
  const selectedTask = selectSelectedTask(state)
  if (!selectedTask || state.files.length > 0) return null

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
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
  )
}

/** 已上传源图缩略条（点击预览 / 悬浮移除） */
export function SourceImageStrip({ className }: { className?: string }) {
  const state = studioStore.useStore()
  if (!state.files.length) return null

  return (
    <div className={`flex gap-2 overflow-x-auto ${className ?? ''}`}>
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
            className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition pointer-coarse:opacity-100 group-hover:opacity-100"
            onClick={() => removeUploadedImage(file.id)}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** 上传源图按钮（含隐藏 file input、数量上限门控与 n/limit 计数） */
export function UploadImagesButton({ className, label }: { className?: string, label?: string }) {
  const state = studioStore.useStore()
  const models = mediaModelsStore.useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isVideo = models.mediaMode === 'video'
  const uploadLimit = currentUploadLimit()
  const uploadDisabled = state.files.length >= uploadLimit

  function onFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    void appendUploadedImages(Array.from(event.target.files || []).filter(file => file.type.startsWith('image/')))
    event.target.value = ''
  }

  return (
    <>
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
        className={className}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="size-4" />
        {label}
        {state.files.length > 0 && `${state.files.length}/${uploadLimit}`}
      </button>
    </>
  )
}

/** prompt 输入框：高度跟随内容（含 store 外部写入场景），Ctrl/Cmd+Enter 提交 */
export function PromptTextarea({
  className,
  rows = 2,
  maxHeight = 160
}: {
  className?: string
  rows?: number
  maxHeight?: number
}) {
  const state = studioStore.useStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    // 另一形态被 CSS 隐藏时 scrollHeight 为 0，此时保持 auto 交由 rows 决定高度
    if (state.prompt && el.scrollHeight > 0) {
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    }
  }, [state.prompt, maxHeight])

  function onPromptKeydown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      submitComposer()
    }
  }

  return (
    <textarea
      ref={textareaRef}
      value={state.prompt}
      rows={rows}
      maxLength={promptLimit}
      placeholder={selectPromptPlaceholder(state)}
      className={className}
      onChange={event => setPrompt(event.target.value)}
      onKeyDown={onPromptKeydown}
    />
  )
}

/** 预估费用标签（无法预估时不渲染） */
export function CostEstimateLabel({ cost, className }: { cost?: number, className?: string }) {
  if (cost == null) return null
  const costText = `$${(+cost).toFixed(3).replace(/\.?0+$/, '')}`

  return (
    <span className={`label-mono inline-flex shrink-0 items-center gap-1 ${className ?? ''}`}>
      <Coins className="size-3" />
      ≈ {costText}
    </span>
  )
}
