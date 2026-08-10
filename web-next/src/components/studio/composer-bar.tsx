'use client'

import { ArrowUp } from 'lucide-react'
import { resolveMediaModelSpec, videoResolutions } from '@/lib/shared/media-models'
import { mediaModelsStore } from '@/lib/studio/media-models-store'
import {
  selectEstimatedCost,
  selectSubmitLabel,
  setVideoDuration,
  setVideoResolution,
  studioStore
} from '@/lib/studio/tasks-store'
import {
  availableVideoDurations,
  CostEstimateLabel,
  EditingChipRow,
  PromptTextarea,
  SourceImageStrip,
  submitComposer,
  UploadImagesButton,
  useRatioWhitelistGuard
} from './composer-parts'
import { ModeTabs } from './mode-tabs'
import { MediaModelMenu } from './media-model-menu'
import { RatioResolutionPopover } from './ratio-resolution-popover'
import { QualityPopover } from './quality-popover'

/** 底部悬浮创作栏（全断面统一形态）：模式 / 模型 / 参数 / 源图 / prompt / 提交 */
export function ComposerBar() {
  const state = studioStore.useStore()
  const models = mediaModelsStore.useStore()
  useRatioWhitelistGuard()

  const isVideo = models.mediaMode === 'video'
  const imageSpec = resolveMediaModelSpec(models.imageModel)
  const videoSpec = resolveMediaModelSpec(models.videoModel)
  const canSubmit = state.prompt.trim().length > 0
  const submitLabel = selectSubmitLabel(state)
  const estimatedCost = selectEstimatedCost(state)
  const availableDurations = availableVideoDurations(videoSpec)

  return (
    <div className="glass-input p-3">
      <EditingChipRow className="mb-2" />

      <SourceImageStrip className="mb-2" />

      <PromptTextarea className="w-full resize-none bg-transparent p-1 text-base outline-none placeholder:opacity-50" />

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

          <UploadImagesButton className="glass-pill flex h-8 shrink-0 items-center gap-1 px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40" />

          <CostEstimateLabel cost={estimatedCost} />
        </div>

        <button
          type="button"
          aria-label={submitLabel}
          title={`${submitLabel}（Ctrl+Enter）`}
          disabled={!canSubmit}
          className="glass-btn flex size-9 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
          onClick={submitComposer}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )
}
