'use client'

// 对话流滚动缩略导航(scroll minimap):左缘一列刻度对应每条生成记录,
// 悬停浮出提示词预览,点击跳转;视口内的记录刻度加深(IntersectionObserver)
import { useEffect, useState } from 'react'
import { Tooltip } from '@heroui/react'
import type { MediaTask } from '@/lib/studio/tasks-store'

function jumpToTurn(taskId: string) {
  document
    .querySelector(`[data-turn-id="${taskId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function tickClass(task: MediaTask, inView: boolean) {
  if (task.status === 'error') return 'bg-red-400/70 hover:bg-red-500'
  if (task.status === 'generating') return 'animate-pulse bg-(--app-primary)'
  return inView
    ? 'bg-black/65 dark:bg-white/75'
    : 'bg-black/20 hover:bg-black/55 dark:bg-white/25 dark:hover:bg-white/65'
}

/** tasks 按展示顺序传入(与对话流一致,旧在上新在下) */
export function StreamMinimap({ tasks }: { tasks: MediaTask[] }) {
  const [inViewIds, setInViewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('[data-turn-id]'))
    if (!elements.length) return
    const observer = new IntersectionObserver((entries) => {
      setInViewIds((prev) => {
        const next = new Set(prev)
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-turn-id')
          if (!id) continue
          if (entry.isIntersecting) next.add(id)
          else next.delete(id)
        }
        return next
      })
    }, { threshold: 0.15 })
    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [tasks.length])

  if (tasks.length < 2) return null

  // 刻度间距随数量收敛,超长列表整体限高滚动兜底
  const gap = Math.max(2, Math.min(8, Math.floor(560 / tasks.length)))

  return (
    <div
      className="fixed left-2 top-1/2 z-30 hidden max-h-[76vh] -translate-y-1/2 flex-col items-center overflow-y-auto lg:flex"
      style={{ gap, scrollbarWidth: 'none' }}
      aria-label="生成记录导航"
    >
      {tasks.map(task => (
        <Tooltip.Root key={task.id} delay={80} closeDelay={0}>
          <Tooltip.Trigger<'button'>
            aria-label={`跳转:${task.prompt.slice(0, 20)}`}
            className={`h-[3px] w-3.5 shrink-0 cursor-pointer rounded-full transition-all hover:w-6 ${tickClass(task, inViewIds.has(task.id))}`}
            onClick={() => jumpToTurn(task.id)}
            render={props => <button type="button" {...props} />}
          />
          <Tooltip.Content placement="right" offset={10} className="glass-panel max-w-64 rounded-xl px-3 py-2">
            <p className="line-clamp-3 text-xs leading-5">{task.prompt}</p>
            <p className="label-mono mt-1 text-[10px] opacity-50">
              {task.kind === 'video' ? '视频' : '图片'} · {task.model}
            </p>
          </Tooltip.Content>
        </Tooltip.Root>
      ))}
    </div>
  )
}
