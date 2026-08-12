'use client'

import { useEffect } from 'react'
import { Clapperboard, ImagePlus, LayoutGrid, Rows3, WandSparkles } from 'lucide-react'
import { PresetRow } from '@/components/chat/preset-row'
import { CloudHistoryPanel } from '@/components/studio/cloud-history-panel'
import { ComposerBar } from '@/components/studio/composer-bar'
import { appendPresetPrompt } from '@/components/studio/composer-parts'
import { ConfirmDialog } from '@/components/studio/confirm-dialog'
import { EditHistoryPanel } from '@/components/studio/edit-history-panel'
import { MediaPreviewOverlay } from '@/components/studio/media-preview-overlay'
import { MediaStream } from '@/components/studio/media-stream'
import { MediaTaskGrid } from '@/components/studio/media-task-grid'
import { TaskBatchToolbar } from '@/components/studio/task-batch-toolbar'
import { imagePromptPresets, videoPromptPresets } from '@/lib/presets'
import { mediaModelsStore } from '@/lib/studio/media-models-store'
import {
  disposeStudio,
  initStudio,
  onDragEnterImages,
  onDragLeaveImages,
  onDragOverImages,
  onDropImages,
  onPasteImages,
  setPrompt,
  setStudioView,
  studioStore,
  trimUploadedImagesToLimit
} from '@/lib/studio/tasks-store'

/** 视图切换:对话流 / 网格 */
function ViewToggle({ view }: { view: 'stream' | 'grid' }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-black/5 p-0.5 dark:bg-white/5">
      <button
        type="button"
        aria-label="对话流视图"
        title="对话流视图"
        data-selected={view === 'stream'}
        className="glass-pill flex size-7 items-center justify-center rounded-full"
        onClick={() => setStudioView('stream')}
      >
        <Rows3 className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="网格视图"
        title="网格视图"
        data-selected={view === 'grid'}
        className="glass-pill flex size-7 items-center justify-center rounded-full"
        onClick={() => setStudioView('grid')}
      >
        <LayoutGrid className="size-3.5" />
      </button>
    </div>
  )
}

/** 无任务时的空态引导:预设灵感只在这里出现(冷启动),有历史后不再打扰 */
function StudioEmptyState({ isVideo }: { isVideo: boolean }) {
  const presets = isVideo ? videoPromptPresets : imagePromptPresets
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <div className="glass-orb flex size-14 items-center justify-center rounded-3xl">
        {isVideo ? <Clapperboard className="size-6" /> : <WandSparkles className="size-6" />}
      </div>
      <div>
        <h2 className="text-lg font-bold">
          {isVideo ? '生成你的第一个视频' : '生成你的第一张图片'}
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm opacity-60">
          {isVideo
            ? '在下方描述画面与镜头，或上传一张图片让它动起来。'
            : '在下方描述你想要的画面，也可以上传参考图以图生图。'}
        </p>
      </div>
      <div className="mx-auto max-w-lg">
        <PresetRow presets={presets} center onSelect={appendPresetPrompt} />
      </div>
      <p className="label-mono opacity-40">更多灵感在「灵感墙」,点一下就能拿来创作</p>
    </div>
  )
}

/** 创作台：任务流居中 + 底部悬浮创作栏（对齐 Vue 版形态，全断面统一） */
export default function StudioPage() {
  const state = studioStore.useStore()
  const models = mediaModelsStore.useStore()
  const isVideo = models.mediaMode === 'video'

  useEffect(() => {
    initStudio()

    // 从灵感墙「用它创作」带过来的 prompt（读 location.search，避免 useSearchParams 的 Suspense 要求）
    const incoming = new URLSearchParams(window.location.search).get('prompt')
    if (incoming?.trim()) {
      setPrompt(incoming.trim())
      window.history.replaceState(null, '', '/studio')
    }

    return () => disposeStudio()
  }, [])

  // 模式 / 图片模型切换导致源图上限收紧时裁剪超出部分（对应 Vue 的 currentUploadLimit watcher）
  const { mediaMode, imageModel } = models
  useEffect(() => {
    if (!mediaMode && !imageModel) return
    trimUploadedImagesToLimit()
  }, [mediaMode, imageModel])

  const imageCount = state.queue.filter(task => task.kind === 'image').length
  const videoCount = state.queue.filter(task => task.kind === 'video').length
  const statsParts: string[] = []
  if (imageCount) statsParts.push(`${imageCount} 张图片`)
  if (videoCount) statsParts.push(`${videoCount} 个视频`)
  const statsText = statsParts.join(' · ') || '还没有生成记录'

  return (
    <div
      className="aurora-shell relative flex min-h-0 flex-1 flex-col overflow-hidden"
      onDragEnter={onDragEnterImages}
      onDragOver={onDragOverImages}
      onDragLeave={onDragLeaveImages}
      onDrop={onDropImages}
      onPaste={onPasteImages}
    >
      {/* 固定工具条:不随内容滚动,滚到多深都能切视图/进批量 */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 pb-2 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h1 className="text-lg font-bold tracking-tight">创作台</h1>
          <p className="label-mono">{statsText}</p>
        </div>
        <div className="flex items-center gap-2">
          <CloudHistoryPanel />
          {state.queue.length > 0 && <ViewToggle view={state.studioView} />}
          <TaskBatchToolbar />
        </div>
      </div>

      {state.studioView === 'stream' && state.queue.length > 0
        ? <MediaStream />
        : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-72 sm:px-6">
              <div className="mx-auto w-full max-w-7xl">
                {state.queue.length
                  ? <MediaTaskGrid tasks={state.queue} />
                  : <StudioEmptyState isVideo={isVideo} />}
              </div>
            </div>
          )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-6">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl">
          <ComposerBar />
        </div>
      </div>

      {state.isDraggingImages && (
        <div className="pointer-events-none absolute inset-0 z-20 m-3 grid place-items-center rounded-3xl border-2 border-dashed border-(--app-primary) bg-(--app-primary-subtle)">
          <div className="glass-panel flex items-center gap-2 px-4 py-2.5">
            <ImagePlus className="size-5 text-(--app-primary)" />
            <span className="text-sm font-semibold">
              松开鼠标，把图片作为{isVideo ? '视频源图' : '编辑参考图'}
            </span>
          </div>
        </div>
      )}

      <MediaPreviewOverlay />
      <EditHistoryPanel />
      <ConfirmDialog />
    </div>
  )
}
