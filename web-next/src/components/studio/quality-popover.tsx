'use client'

import { useEffect, useRef, useState } from 'react'
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
  const rootRef = useRef<HTMLDivElement>(null)

  const ActiveIcon = qualityIcons[state.quality] || Gem

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="glass-pill flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium"
        onClick={() => setOpen(value => !value)}
      >
        <ActiveIcon className="size-4 shrink-0" />
        质量: {getImageQualityLabel(state.quality)}
      </button>

      {open && (
        <div className="glass-panel absolute bottom-full left-0 z-50 mb-2 w-60 p-1.5 animate-fade-scale">
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
      )}
    </div>
  )
}
