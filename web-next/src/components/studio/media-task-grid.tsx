'use client'

import type { MediaTask } from '@/lib/studio/tasks-store'
import { MediaTaskCard } from './media-task-card'

/** 任务卡片瀑布网格（最新在前） */
export function MediaTaskGrid({ tasks }: { tasks: MediaTask[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {tasks.map(task => (
        <MediaTaskCard key={task.id} task={task} />
      ))}
    </div>
  )
}
