'use client'

import { ArrowUp, Gauge, Gem, Sparkles, WandSparkles } from 'lucide-react'
import { PresetRow } from '@/components/chat/preset-row'
import { imagePromptPresets, videoPromptPresets } from '@/lib/presets'
import { imageQualityItems, imageResolutions, type ImageQuality, type ImageRatio } from '@/lib/shared/images'
import { resolveMediaModelSpec, videoResolutions } from '@/lib/shared/media-models'
import { mediaModelsStore } from '@/lib/studio/media-models-store'
import {
  selectEstimatedCost,
  selectImageSize,
  selectSubmitLabel,
  setQuality,
  setRatio,
  setResolution,
  setVideoDuration,
  setVideoResolution,
  studioStore
} from '@/lib/studio/tasks-store'
import {
  appendPresetPrompt,
  availableVideoDurations,
  CostEstimateLabel,
  EditingChipRow,
  PromptTextarea,
  SourceImageStrip,
  submitComposer,
  UploadImagesButton,
  useRatioWhitelistGuard
} from './composer-parts'
import { MediaModelMenu } from './media-model-menu'
import { ModeTabs } from './mode-tabs'

/** 与 RatioResolutionPopover 相同的比例选项表（该组件不可改动，左轨把选项平铺展示） */
const allRatioOptions: Array<{ value: ImageRatio, aspect: string, auto?: boolean }> = [
  { value: '1:1', aspect: '1 / 1' },
  { value: '3:2', aspect: '3 / 2' },
  { value: '16:9', aspect: '16 / 9' },
  { value: '21:9', aspect: '21 / 9' },
  { value: '9:16', aspect: '9 / 16' },
  { value: '4:3', aspect: '4 / 3' },
  { value: '3:4', aspect: '3 / 4' },
  { value: 'Auto', aspect: '1 / 1', auto: true }
]

/** 与 QualityPopover 相同的质量图标映射（gauge / sparkles / gem） */
const qualityIcons: Record<ImageQuality, typeof Gem> = {
  low: Gauge,
  medium: Sparkles,
  high: Gem
}

/**
 * 桌面左轨参数面板（lg+）：模式 / 模型 / 参数平铺 / 参考图 / prompt / 提交。
 * 参数不再用 popover 收纳，而是按 InvokeAI 式左轨直接铺开；
 * 白名单与门控逻辑（比例集合、分辨率与质量档、时长上限）与 ComposerBar 一致。
 */
export function ComposerPanel() {
  const state = studioStore.useStore()
  const models = mediaModelsStore.useStore()
  useRatioWhitelistGuard()

  const isVideo = models.mediaMode === 'video'
  const imageSpec = resolveMediaModelSpec(models.imageModel)
  const videoSpec = resolveMediaModelSpec(models.videoModel)
  const showResolution = Boolean(imageSpec.supportsSizeQuality)
  const allowedRatios = imageSpec.supportedAspectRatios
  const ratioOptions = allowedRatios
    ? allRatioOptions.filter(option => option.auto || allowedRatios.includes(option.value))
    : allRatioOptions
  const availableDurations = availableVideoDurations(videoSpec)
  const canSubmit = state.prompt.trim().length > 0
  const submitLabel = selectSubmitLabel(state)
  const estimatedCost = selectEstimatedCost(state)
  const presets = isVideo ? videoPromptPresets : imagePromptPresets
  const showPresets = !state.prompt.trim() && !state.files.length

  return (
    <aside className="flex min-h-0 flex-col border-r border-black/5 dark:border-white/10">
      {/* 参数区：独立滚动 */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <ModeTabs />

        <section>
          <p className="label-mono mb-2">模型</p>
          <MediaModelMenu className="w-full" />
        </section>

        {!isVideo
          ? (
              <>
                <section>
                  <p className="label-mono mb-2">画面比例</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ratioOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        data-selected={state.ratio === option.value}
                        className="glass-pill flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-xs font-semibold"
                        onClick={() => setRatio(option.value)}
                      >
                        {option.auto
                          ? <WandSparkles className="size-4 opacity-70" />
                          : (
                              <span
                                className="block w-6 rounded-[3px] border-2 border-current opacity-70"
                                style={{ aspectRatio: option.aspect }}
                              />
                            )}
                        {option.value}
                      </button>
                    ))}
                  </div>

                  {showResolution
                    ? (
                        <>
                          <p className="label-mono mt-4 mb-2">分辨率</p>
                          <div className="flex gap-1.5">
                            {imageResolutions.map(item => (
                              <button
                                key={item}
                                type="button"
                                data-selected={state.resolution === item}
                                className="glass-pill flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold"
                                onClick={() => setResolution(item)}
                              >
                                {item}
                              </button>
                            ))}
                          </div>

                          <p className="label-mono mt-3">输出尺寸 {selectImageSize(state)}</p>
                        </>
                      )
                    : <p className="label-mono mt-3">该模型不支持指定分辨率</p>}
                </section>

                {imageSpec.supportsSizeQuality && (
                  <section>
                    <p className="label-mono mb-2">质量</p>
                    <div className="flex flex-col gap-1">
                      {imageQualityItems.map((item) => {
                        const ItemIcon = qualityIcons[item.value]
                        return (
                          <button
                            key={item.value}
                            type="button"
                            data-selected={state.quality === item.value}
                            className="glass-pill flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left"
                            onClick={() => setQuality(item.value)}
                          >
                            <ItemIcon className="mt-0.5 size-4 shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">{item.label}</span>
                              <span className="block text-xs opacity-70">{item.description}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}
              </>
            )
          : (
              <>
                <section>
                  <p className="label-mono mb-2">时长</p>
                  <div className="flex gap-1.5">
                    {availableDurations.map(option => (
                      <button
                        key={option}
                        type="button"
                        data-selected={state.videoDuration === option}
                        className="glass-pill flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold"
                        onClick={() => setVideoDuration(option)}
                      >
                        {option}s
                      </button>
                    ))}
                  </div>
                </section>

                {videoSpec.supportsVideoResolution && (
                  <section>
                    <p className="label-mono mb-2">分辨率</p>
                    <div className="flex gap-1.5">
                      {videoResolutions.map(option => (
                        <button
                          key={option}
                          type="button"
                          data-selected={state.videoResolution === option}
                          className="glass-pill flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold"
                          onClick={() => setVideoResolution(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

        <section>
          <p className="label-mono mb-2">{isVideo ? '源图' : '参考图'}</p>
          <div className="flex flex-col gap-2">
            <UploadImagesButton
              label="上传图片"
              className="glass-pill flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/10 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15"
            />
            <SourceImageStrip />
            <EditingChipRow className="flex-wrap" />
          </div>
        </section>
      </div>

      {/* 操作区：固定在左轨底部，提交始终可见 */}
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-black/5 p-4 dark:border-white/10">
        <PromptTextarea
          className="glass-input w-full resize-none p-3 text-sm outline-none placeholder:opacity-50"
          rows={4}
          maxHeight={240}
        />

        <CostEstimateLabel cost={estimatedCost} />

        <button
          type="button"
          aria-label={submitLabel}
          title={`${submitLabel}（Ctrl+Enter）`}
          disabled={!canSubmit}
          className="glass-btn flex h-11 w-full items-center justify-center gap-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
          onClick={submitComposer}
        >
          <ArrowUp className="size-4" />
          {submitLabel}
        </button>

        {/* 单行横向滚动,避免多行撑破底部 dock 被面板边缘裁切 */}
        {showPresets && (
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [&>div]:w-max [&>div]:flex-nowrap">
            <PresetRow presets={presets} onSelect={appendPresetPrompt} />
          </div>
        )}
      </div>
    </aside>
  )
}
