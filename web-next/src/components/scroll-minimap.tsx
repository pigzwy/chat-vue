'use client'

// 滚动缩略导航(scroll minimap,通用):一列刻度对应长流里的记录,
// 悬停浮出内容预览,点击跳转;视口内的记录刻度加深(IntersectionObserver)。
// 创作台对话流(左缘)与聊天页(右缘,让位给会话边栏)共用。
import { useEffect, useState } from 'react'
import { Tooltip } from '@heroui/react'

export interface MinimapItem {
  id: string
  /** 悬停预览文本(通常是提示词/提问) */
  label: string
  /** 预览底部的小字元信息 */
  meta?: string
  tone?: 'default' | 'error' | 'busy'
}

function tickClass(tone: MinimapItem['tone'], inView: boolean) {
  if (tone === 'error') return 'bg-red-400/70 hover:bg-red-500'
  if (tone === 'busy') return 'animate-pulse bg-(--app-primary)'
  return inView
    ? 'bg-black/65 dark:bg-white/75'
    : 'bg-black/20 hover:bg-black/55 dark:bg-white/25 dark:hover:bg-white/65'
}

export function ScrollMinimap({
  items,
  attr,
  side = 'left'
}: {
  items: MinimapItem[]
  /** 跳转目标元素上的标记属性名,如 data-turn-id */
  attr: string
  side?: 'left' | 'right'
}) {
  const [inViewIds, setInViewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(`[${attr}]`))
    if (!elements.length) return
    const observer = new IntersectionObserver((entries) => {
      setInViewIds((prev) => {
        const next = new Set(prev)
        for (const entry of entries) {
          const id = entry.target.getAttribute(attr)
          if (!id) continue
          if (entry.isIntersecting) next.add(id)
          else next.delete(id)
        }
        return next
      })
    }, { threshold: 0.15 })
    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [attr, items.length])

  if (items.length < 2) return null

  // 刻度间距随数量收敛,超长列表整体限高滚动兜底
  const gap = Math.max(2, Math.min(8, Math.floor(560 / items.length)))
  const sideClass = side === 'left' ? 'left-2' : 'right-2'
  const placement = side === 'left' ? 'right' : 'left'

  return (
    <div
      className={`fixed ${sideClass} top-1/2 z-30 hidden max-h-[76vh] -translate-y-1/2 flex-col items-center overflow-y-auto lg:flex`}
      style={{ gap, scrollbarWidth: 'none' }}
      aria-label="记录导航"
    >
      {items.map(item => (
        <Tooltip.Root key={item.id} delay={80} closeDelay={0}>
          <Tooltip.Trigger<'button'>
            aria-label={`跳转:${item.label.slice(0, 20)}`}
            className={`h-[3px] w-3.5 shrink-0 cursor-pointer rounded-full transition-all hover:w-6 ${tickClass(item.tone, inViewIds.has(item.id))}`}
            onClick={() => {
              document
                .querySelector(`[${attr}="${item.id}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            render={props => <button type="button" {...props} />}
          />
          <Tooltip.Content placement={placement} offset={10} className="glass-panel max-w-64 rounded-xl px-3 py-2">
            <p className="line-clamp-3 text-xs leading-5">{item.label}</p>
            {item.meta && <p className="label-mono mt-1 text-[10px] opacity-50">{item.meta}</p>}
          </Tooltip.Content>
        </Tooltip.Root>
      ))}
    </div>
  )
}
