'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import { KeyManager } from '@/components/key-manager'
import { checkConnection, logout, modelsStore } from '@/lib/models-store'

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

/** 网关连接呼吸灯:绿=已连接,红=已断开(需重新登录),hover 看详情 */
function ConnectionDot() {
  const { connection, connectionDetail } = modelsStore.useStore()

  useEffect(() => {
    void checkConnection()
    const timer = window.setInterval(() => { void checkConnection() }, 60_000)
    const onFocus = () => { void checkConnection() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (connection === 'unknown') return null
  const color = connection === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
  return (
    <span className="relative ml-0.5 flex size-2 shrink-0" title={connectionDetail}>
      <span className={`status-breathe absolute inline-flex size-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex size-2 rounded-full ${color}`} />
    </span>
  )
}

function ColorModeButton() {
  // 惰性读取 DOM 初始主题;SSR 时为 false,配合 suppressHydrationWarning 消除水合差异
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('color-scheme', next ? 'dark' : 'light')
    setDark(next)
  }, [])

  return (
    <button
      type="button"
      aria-label="切换深浅色"
      title="切换深浅色"
      className="glass-chip pointer-events-auto flex size-9 items-center justify-center"
      suppressHydrationWarning
      onClick={toggle}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

export function TopNav() {
  const pathname = usePathname()

  return (
    <>
      {/* 品牌章全断面可见:移动端仅头像,sm+ 带名字 */}
      <div className="pointer-events-none fixed left-3 top-3 z-50 sm:left-4">
        <Link
          href="/"
          className="glass-chip pointer-events-auto inline-flex items-center gap-2 p-1.5 pr-2.5 transition-transform hover:-translate-y-0.5 sm:pr-3"
        >
          <Image
            src="/logo-mark.jpg"
            alt="pigcoder"
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full object-cover"
          />
          <span className="hidden text-sm font-bold tracking-tight sm:inline">pigcoder</span>
          <ConnectionDot />
        </Link>
      </div>

      {/* 导航:移动端从品牌章右侧排起,sm+ 居中 */}
      <nav className="pointer-events-none fixed left-[3.4rem] top-3 z-50 sm:left-1/2 sm:-translate-x-1/2">
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

      <div className="pointer-events-none fixed right-3 top-3 z-50 flex items-center gap-1.5 sm:right-4 sm:gap-2">
        <KeyManager />
        <button
          type="button"
          aria-label="退出登录"
          title="退出登录"
          className="glass-chip pointer-events-auto flex size-9 items-center justify-center"
          onClick={() => logout()}
        >
          <LogOut className="size-4" />
        </button>
        <ColorModeButton />
      </div>
    </>
  )
}
