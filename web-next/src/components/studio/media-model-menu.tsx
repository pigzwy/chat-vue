'use client'

import { useState } from 'react'
import { Popover } from '@heroui/react'
import { Check, ChevronUp, LoaderCircle } from 'lucide-react'
import { GrokIcon, OpenaiIcon } from '@/components/brand-icons'
import {
  activeMediaModel,
  curatedMediaOptions,
  mediaModelsStore,
  selectMediaModel
} from '@/lib/studio/media-models-store'
import { resolveMediaModelSpec } from '@/lib/shared/media-models'

const providerIcons: Record<'openai' | 'grok', typeof OpenaiIcon> = {
  openai: OpenaiIcon,
  grok: GrokIcon
}

/** 创作台模型菜单（含价格 / 说明，向上弹出）；className 供左轨形态拉伸触发器 */
export function MediaModelMenu({ className }: { className?: string }) {
  const state = mediaModelsStore.useStore()
  const [open, setOpen] = useState(false)

  const options = curatedMediaOptions(state, state.mediaMode)
  const active = activeMediaModel(state)
  const activeLabel = options.find(item => item.value === active)?.label || resolveMediaModelSpec(active).label
  const ActiveIcon = providerIcons[resolveMediaModelSpec(active).provider]

  return (
    <Popover.Root isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger className={`glass-pill flex h-8 shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-sm font-medium ${className || 'max-w-48'}`}>
        <ActiveIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
        <ChevronUp className="size-4 shrink-0 opacity-60" />
      </Popover.Trigger>

      <Popover.Content placement="top start" offset={8} className="glass-panel w-80">
        <Popover.Dialog className="p-2 outline-none">
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
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  )
}
