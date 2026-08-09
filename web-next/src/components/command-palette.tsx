'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from '@heroui-pro/react/command'
import { Lightbulb, LogOut, MessagesSquare, Mic, Plus, Search, WandSparkles } from 'lucide-react'
import { chatsStore } from '@/lib/chats-store'
import { logout } from '@/lib/models-store'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/** ⌘K 全局命令面板:快捷操作 + 会话搜索(HeroUI Pro Command,自带过滤与键盘导航) */
export function CommandPalette() {
  const router = useRouter()
  const chats = chatsStore.useStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(value => !value)
        return
      }
      // 'c' 新建对话(仅在非输入场景,对齐 Vue 版 defineShortcuts)
      if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault()
        router.push('/')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [router])

  function go(path: string) {
    setOpen(false)
    router.push(path)
  }

  const recentChats = chats.slice(0, 30)

  return (
    <Command.Root>
      <Command.Backdrop isOpen={open} onOpenChange={setOpen} className="bg-black/30 backdrop-blur-sm">
        <Command.Container size="md" className="glass-panel glass-panel--lg">
          <Command.Dialog aria-label="命令面板">
            <Command.Header>
              <Command.InputGroup>
                <Command.InputGroup.Prefix>
                  <Search className="size-4 opacity-50" />
                </Command.InputGroup.Prefix>
                <Command.InputGroup.Input placeholder="搜索对话,或输入命令..." />
                <Command.InputGroup.ClearButton />
              </Command.InputGroup>
            </Command.Header>
            <Command.List renderEmptyState={() => (
              <p className="px-4 py-8 text-center text-sm opacity-50">没有匹配的结果</p>
            )}
            >
              <Command.Group heading="快捷操作">
                <Command.Item textValue="新建对话" onAction={() => go('/')}>
                  <Plus className="size-4 shrink-0" />
                  新建对话
                  <kbd className="label-mono ml-auto text-[10px] opacity-50">C</kbd>
                </Command.Item>
                <Command.Item textValue="创作台 图片 视频" onAction={() => go('/studio')}>
                  <WandSparkles className="size-4 shrink-0" />
                  去创作台
                </Command.Item>
                <Command.Item textValue="语音 通话" onAction={() => go('/voice')}>
                  <Mic className="size-4 shrink-0" />
                  语音工作台
                </Command.Item>
                <Command.Item textValue="灵感墙 案例" onAction={() => go('/gallery')}>
                  <Lightbulb className="size-4 shrink-0" />
                  灵感墙
                </Command.Item>
                <Command.Item textValue="退出登录" onAction={() => { setOpen(false); logout() }}>
                  <LogOut className="size-4 shrink-0" />
                  退出登录
                </Command.Item>
              </Command.Group>
              {recentChats.length > 0 && (
                <Command.Group heading="最近对话">
                  {recentChats.map(chat => (
                    <Command.Item key={chat.id} textValue={chat.title} onAction={() => go(`/chat/${chat.id}`)}>
                      <MessagesSquare className="size-4 shrink-0 opacity-60" />
                      <span className="min-w-0 truncate">{chat.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <Command.Footer>
              <span className="label-mono text-[10px] opacity-50">↑↓ 选择 · Enter 打开 · Esc 关闭 · ⌘K 唤起</span>
            </Command.Footer>
          </Command.Dialog>
        </Command.Container>
      </Command.Backdrop>
    </Command.Root>
  )
}
