'use client'

import { useState } from 'react'
import { Popover } from '@heroui/react'
import { Gauge, Gem, Sparkles } from 'lucide-react'
import { getImageQualityLabel, imageQualityItems, type ImageQuality } from '@/lib/shared/images'
import { setQuality, studioStore } from '@/lib/studio/tasks-store'

/** 对应 Vue 版 imageQualityItems 的 iconify 图标（gauge / sparkles / gem） */
const qualityIcons: Record<ImageQuality, typeof Gem> = {
  low: Gauge,
  medium: Sparkles,
  high: Gem
}

/** 图片质量选择（仅 gpt-image 系显示） */
export function QualityPopover() {
  const state = studioStore.useStore()
  const [open, setOpen] = useState(false)

  const ActiveIcon = qualityIcons[state.quality] || Gem

  return (
    <Popover.Root isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger className="glass-pill flex h-8 shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-sm font-medium">
        <ActiveIcon className="size-4 shrink-0" />
        质量: {getImageQualityLabel(state.quality)}
      </Popover.Trigger>

      <Popover.Content placement="top start" offset={8} className="glass-panel w-60">
        <Popover.Dialog className="p-1.5 outline-none">
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
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  )
}
