'use client'

import { Clapperboard, Image as ImageIcon } from 'lucide-react'
import { mediaModelsStore, setMediaMode } from '@/lib/studio/media-models-store'
import type { MediaKind } from '@/lib/shared/media-models'

const tabs: Array<{ value: MediaKind, label: string, Icon: typeof ImageIcon }> = [
  { value: 'image', label: '图片', Icon: ImageIcon },
  { value: 'video', label: '视频', Icon: Clapperboard }
]

/** 图片 / 视频模式切换 */
export function ModeTabs() {
  const { mediaMode } = mediaModelsStore.useStore()

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/5 p-0.5 dark:bg-white/5">
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          data-selected={mediaMode === tab.value}
          className="glass-pill inline-flex h-7 items-center gap-1 px-2.5 text-xs font-semibold"
          onClick={() => setMediaMode(tab.value)}
        >
          <tab.Icon className="size-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  )
}
