'use client'

// 创作台对话流的滚动缩略导航:MediaTask → 通用 ScrollMinimap(左缘)
import { ScrollMinimap, type MinimapItem } from '@/components/scroll-minimap'
import type { MediaTask } from '@/lib/studio/tasks-store'

function toItem(task: MediaTask): MinimapItem {
  return {
    id: task.id,
    label: task.prompt,
    meta: `${task.kind === 'video' ? '视频' : '图片'} · ${task.model}`,
    tone: task.status === 'error' ? 'error' : task.status === 'generating' ? 'busy' : 'default'
  }
}

/** tasks 按展示顺序传入(与对话流一致,旧在上新在下) */
export function StreamMinimap({ tasks }: { tasks: MediaTask[] }) {
  return <ScrollMinimap items={tasks.map(toItem)} attr="data-turn-id" side="left" />
}
