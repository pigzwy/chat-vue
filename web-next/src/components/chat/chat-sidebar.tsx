'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Drawer } from '@heroui/react'
import { MessagesSquare, PanelLeft, PanelLeftClose, Search, SquarePen, X } from 'lucide-react'
import { chatsStore, deleteChat, groupChats } from '@/lib/chats-store'
import { createStore } from '@/lib/store'
import { toast } from '@/lib/toast'

/* 桌面侧栏收起偏好(持久化;serverSnapshot=false 避免直连水合不匹配) */
const COLLAPSED_KEY = 'sidebar-collapsed'
const collapsedStore = createStore(
  typeof window !== 'undefined' && window.localStorage.getItem(COLLAPSED_KEY) === '1',
  { serverSnapshot: false }
)

function toggleCollapsed() {
  const next = !collapsedStore.get()
  collapsedStore.set(next)
  window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '')
}

/** 侧栏行的统一样式(对齐 ChatGPT:同一左边线、同一行高、朴素 hover/选中态) */
const rowClass = 'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const chats = chatsStore.useStore()
  const pathname = usePathname()
  const router = useRouter()

  const groups = useMemo(() => groupChats(chats), [chats])

  function onDelete(id: string) {
    deleteChat(id)
    toast({ title: '对话已删除', description: '已从本地对话列表中移除' })
    if (pathname === `/chat/${id}`) router.push('/')
  }

  function openSearch() {
    window.dispatchEvent(new CustomEvent('app:open-command-palette'))
    onNavigate?.()
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <Link href="/" className={`${rowClass} font-medium`} onClick={onNavigate}>
          <SquarePen className="size-4 shrink-0 opacity-70" />
          新建对话
        </Link>
        <button type="button" className={rowClass} onClick={openSearch}>
          <Search className="size-4 shrink-0 opacity-70" />
          搜索对话
          <kbd className="label-mono ml-auto text-[10px] opacity-40 pointer-coarse:hidden">⌘K</kbd>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {groups.map(group => (
          <div key={group.id}>
            <p className="px-3 pb-1 pt-4 text-xs opacity-50">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const selected = pathname === item.href
                return (
                  <div key={item.id} className="group relative">
                    <Link
                      href={item.href}
                      className={`${rowClass} block truncate pr-8 leading-9 ${selected ? 'bg-black/[0.06] font-medium dark:bg-white/[0.08]' : ''}`}
                      onClick={onNavigate}
                    >
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      aria-label="删除对话"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-0 transition group-hover:opacity-60 hover:!opacity-100 pointer-coarse:opacity-60"
                      onClick={() => onDelete(item.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {!groups.length && (
          <p className="px-3 pt-4 text-xs opacity-50">还没有对话记录</p>
        )}
      </div>
    </>
  )
}

/** 会话侧栏：桌面常驻，移动端浮动按钮 + 抽屉 */
export function ChatSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // 路由变化时收起抽屉（渲染期状态调整，见 react.dev「You Might Not Need an Effect」）
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    if (open) setOpen(false)
  }

  const collapsed = collapsedStore.useStore()

  return (
    <>
      {collapsed
        ? (
            <button
              type="button"
              aria-label="打开边栏"
              title="打开边栏"
              className="fixed left-4 top-16 z-40 hidden size-9 items-center justify-center rounded-lg opacity-60 transition hover:bg-black/5 hover:opacity-100 lg:flex dark:hover:bg-white/5"
              onClick={toggleCollapsed}
            >
              <PanelLeft className="size-4.5" />
            </button>
          )
        : (
            <aside className="hidden w-64 shrink-0 flex-col px-2 pb-4 pt-14 lg:flex">
              <div className="flex justify-end px-1 pb-1">
                <button
                  type="button"
                  aria-label="关闭边栏"
                  title="关闭边栏"
                  className="flex size-8 items-center justify-center rounded-lg opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
                  onClick={toggleCollapsed}
                >
                  <PanelLeftClose className="size-4.5" />
                </button>
              </div>
              <SidebarContent />
            </aside>
          )}

      <Drawer.Root isOpen={open} onOpenChange={setOpen}>
        <Drawer.Trigger
          aria-label="会话列表"
          className="glass-chip fixed bottom-5 left-4 z-50 flex size-11 items-center justify-center lg:hidden"
        >
          <MessagesSquare className="size-5" />
        </Drawer.Trigger>

        <Drawer.Backdrop className="bg-black/30 backdrop-blur-sm lg:hidden">
          <Drawer.Content placement="left" className="p-3">
            <Drawer.Dialog
              aria-label="会话列表"
              className="glass-panel glass-panel--lg flex w-72 max-w-[85vw] flex-col rounded-2xl p-2 pt-3"
            >
              <SidebarContent onNavigate={() => setOpen(false)} />
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer.Root>
    </>
  )
}
