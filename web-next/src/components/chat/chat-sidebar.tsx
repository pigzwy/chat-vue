'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { MessagesSquare, Plus, Search, X } from 'lucide-react'
import { chatsStore, deleteChat, groupChats } from '@/lib/chats-store'
import { toast } from '@/lib/toast'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const chats = chatsStore.useStore()
  const pathname = usePathname()
  const router = useRouter()
  const [keyword, setKeyword] = useState('')

  const groups = useMemo(() => {
    const filtered = keyword.trim()
      ? chats.filter(chat => chat.title.toLowerCase().includes(keyword.trim().toLowerCase()))
      : chats
    return groupChats(filtered)
  }, [chats, keyword])

  function onDelete(id: string) {
    deleteChat(id)
    toast({ title: '对话已删除', description: '已从本地对话列表中移除' })
    if (pathname === `/chat/${id}`) router.push('/')
  }

  return (
    <>
      <Link
        href="/"
        className="glass-btn flex h-10 items-center justify-center gap-1.5 text-sm font-semibold"
        onClick={onNavigate}
      >
        <Plus className="size-4" />
        新建对话
      </Link>

      <label className="glass-pill flex h-9 items-center gap-2 px-3">
        <Search className="size-4 shrink-0 opacity-50" />
        <input
          value={keyword}
          placeholder="搜索对话"
          className="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
          onChange={event => setKeyword(event.target.value)}
        />
      </label>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {groups.map(group => (
          <div key={group.id}>
            <p className="label-mono px-2 pb-1">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(item => (
                <div key={item.id} className="group relative">
                  <Link
                    href={item.href}
                    data-selected={pathname === item.href}
                    className="glass-pill block truncate rounded-xl px-3 py-2 pr-8 text-sm"
                    onClick={onNavigate}
                  >
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    aria-label="删除对话"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                    onClick={() => onDelete(item.id)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && (
          <p className="px-2 text-xs opacity-50">还没有对话记录</p>
        )}
      </div>
    </>
  )
}

/** 会话侧栏：桌面常驻，移动端浮动按钮 + 抽屉（Vue 版移动端无入口，此处为优化项） */
export function ChatSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // 路由变化时收起抽屉（渲染期状态调整，见 react.dev「You Might Not Need an Effect」）
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    if (open) setOpen(false)
  }

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col gap-3 px-2 pb-4 pt-20 lg:flex">
        <SidebarContent />
      </aside>

      <button
        type="button"
        aria-label="会话列表"
        className="glass-chip fixed bottom-5 left-4 z-50 flex size-11 items-center justify-center lg:hidden"
        onClick={() => setOpen(true)}
      >
        <MessagesSquare className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="会话列表">
          <button
            type="button"
            aria-label="关闭会话列表"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="glass-panel glass-panel--lg absolute inset-y-3 left-3 flex w-72 max-w-[85vw] flex-col gap-3 rounded-2xl p-3 pt-4">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
