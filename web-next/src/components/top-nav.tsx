'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Dropdown } from '@heroui/react'
import { LogOut, Moon, Sun } from 'lucide-react'
import { logout } from '@/lib/models-store'

const tabs = [
  { label: '对话', href: '/', icon: '💬' },
  { label: '创作台', href: '/studio', icon: '✨' },
  { label: '语音', href: '/voice', icon: '🎙️' },
  { label: '灵感', href: '/gallery', icon: '💡' }
] as const

function isTabActive(pathname: string, href: string) {
  if (href === '/') {
    return !pathname.startsWith('/studio') && !pathname.startsWith('/gallery') && !pathname.startsWith('/voice')
  }
  return pathname.startsWith(href)
}

/** 右上角:logo 头像即菜单(切换深浅色 / 退出登录),移动端的品牌位也由它承担 */
function AvatarMenu() {
  const [open, setOpen] = useState(false)
  // 惰性读取 DOM 初始主题;SSR 时为 false,配合 suppressHydrationWarning 消除水合差异
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  const toggleColorMode = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('color-scheme', next ? 'dark' : 'light')
    setDark(next)
  }, [])

  return (
    <Dropdown.Root isOpen={open} onOpenChange={setOpen}>
      <Dropdown.Trigger
        aria-label="账户菜单"
        className="glass-chip pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full p-1 transition-transform hover:-translate-y-0.5"
      >
        <Image
          src="/logo-mark.jpg"
          alt="pigcoder"
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full object-cover"
        />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" offset={8} className="glass-panel w-44">
        <Dropdown.Menu className="p-1.5 outline-none">
          <Dropdown.Item
            textValue="切换深浅色"
            className="glass-pill flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium"
            onAction={toggleColorMode}
          >
            <span suppressHydrationWarning className="flex items-center gap-2">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {dark ? '切换浅色模式' : '切换深色模式'}
            </span>
          </Dropdown.Item>
          <Dropdown.Item
            textValue="退出登录"
            className="glass-pill flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-red-500"
            onAction={() => logout()}
          >
            <LogOut className="size-4" />
            退出登录
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}

export function TopNav() {
  const pathname = usePathname()

  return (
    <>
      {/* sm+ 左上角品牌章(移动端品牌由右上角头像菜单承担,避免窄屏三块 fixed 压盖) */}
      <div className="pointer-events-none fixed left-4 top-3 z-50 hidden sm:block">
        <Link
          href="/"
          className="glass-chip pointer-events-auto inline-flex items-center gap-2 py-1.5 pl-1.5 pr-3 transition-transform hover:-translate-y-0.5"
        >
          <Image
            src="/logo-mark.jpg"
            alt="pigcoder"
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full object-cover"
          />
          <span className="hidden text-sm font-bold tracking-tight md:inline">pigcoder</span>
        </Link>
      </div>

      <nav className="pointer-events-none fixed left-3 top-3 z-50 sm:left-1/2 sm:-translate-x-1/2">
        <div className="glass-chip pointer-events-auto inline-flex items-center gap-0.5 p-1 sm:gap-1">
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              data-selected={isTabActive(pathname, tab.href)}
              className="glass-pill inline-flex h-8 items-center px-2.5 text-[13px] font-semibold sm:px-3.5 sm:text-sm"
            >
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="pointer-events-none fixed right-3 top-3 z-50 sm:right-4">
        <AvatarMenu />
      </div>
    </>
  )
}
