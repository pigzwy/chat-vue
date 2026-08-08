'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronUp, LoaderCircle, Sparkles, Zap } from 'lucide-react'
import {
  activeMediaModel,
  curatedMediaOptions,
  mediaModelsStore,
  selectMediaModel
} from '@/lib/studio/media-models-store'
import { resolveMediaModelSpec } from '@/lib/shared/media-models'

/** lucide 没有品牌图标，按 provider 映射（grok → Zap，openai → Sparkles） */
const providerIcons: Record<'openai' | 'grok', typeof Sparkles> = {
  openai: Sparkles,
  grok: Zap
}

/** 创作台模型菜单（含价格 / 说明，向上弹出） */
export function MediaModelMenu() {
  const state = mediaModelsStore.useStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const options = curatedMediaOptions(state, state.mediaMode)
  const active = activeMediaModel(state)
  const activeLabel = options.find(item => item.value === active)?.label || resolveMediaModelSpec(active).label
  const ActiveIcon = providerIcons[resolveMediaModelSpec(active).provider]

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
        className="glass-pill flex h-8 max-w-48 items-center gap-1.5 px-2.5 text-sm font-medium"
        onClick={() => setOpen(value => !value)}
      >
        <ActiveIcon className="size-4 shrink-0" />
        <span className="truncate">{activeLabel}</span>
        <ChevronUp className="size-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="glass-panel absolute bottom-full left-0 z-50 mb-2 w-80 p-2 animate-fade-scale">
          <p className="label-mono mb-1.5 flex items-center gap-1.5 px-1.5 pt-1">
            选择模型
            {state.loadingModels && <LoaderCircle className="size-3 animate-spin" />}
          </p>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {options.map((item) => {
              const ItemIcon = providerIcons[item.provider]
              return (
                <button
                  key={item.value}
                  type="button"
                  data-selected={active === item.value}
                  className="glass-pill flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left"
                  onClick={() => selectMediaModel(item.value)}
                >
                  <ItemIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{item.label}</span>
                      {item.price && <span className="label-mono shrink-0 text-[10px]">{item.price}</span>}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 block text-xs leading-4 opacity-70">{item.description}</span>
                    )}
                  </span>
                  {active === item.value && <Check className="mt-0.5 size-4 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
