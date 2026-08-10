'use client'

import { useState } from 'react'
import { Popover } from '@heroui/react'
import { Proportions, WandSparkles } from 'lucide-react'
import { imageResolutions, type ImageRatio } from '@/lib/shared/images'
import { resolveMediaModelSpec } from '@/lib/shared/media-models'
import { mediaModelsStore } from '@/lib/studio/media-models-store'
import { selectImageSize, setRatio, setResolution, studioStore } from '@/lib/studio/tasks-store'

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

/** 画面比例 + 分辨率选择（分辨率档位仅 gpt-image 系生效；grok 系比例是有限集合） */
export function RatioResolutionPopover() {
  const state = studioStore.useStore()
  const models = mediaModelsStore.useStore()
  const [open, setOpen] = useState(false)

  const spec = resolveMediaModelSpec(models.imageModel)
  const showResolution = Boolean(spec.supportsSizeQuality)
  const allowedRatios = spec.supportedAspectRatios
  const ratioOptions = allowedRatios
    ? allRatioOptions.filter(option => option.auto || allowedRatios.includes(option.value))
    : allRatioOptions
  const triggerLabel = showResolution ? `${state.ratio} · ${state.resolution}` : `比例 ${state.ratio}`
  const size = selectImageSize(state)

  return (
    <Popover.Root isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger className="glass-pill flex h-8 shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-sm font-medium">
        <Proportions className="size-4 shrink-0" />
        {triggerLabel}
      </Popover.Trigger>

      <Popover.Content placement="top start" offset={8} className="glass-panel w-72">
        <Popover.Dialog className="p-3 outline-none">
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

                  <p className="label-mono mt-3">输出尺寸 {size}</p>
                </>
              )
            : <p className="label-mono mt-3">该模型不支持指定分辨率</p>}
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  )
}
