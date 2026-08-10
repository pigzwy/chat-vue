'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import { KeyManager } from '@/components/key-manager'
import { checkConnection, logout, modelsStore } from '@/lib/models-store'
import { gatewayHomeUrl, ssoEntryUrl } from '@/lib/runtime-config'

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

/** 品牌章 + 连接状态:猪鼻子(logo 里自带的绿色 </> 椭圆)即状态灯——
 *  正常保持原生绿;断开时染红并轻微呼吸,点击走网关一键重进。hover 看详情 */
function BrandMark() {
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

  // 断开且配置了接力入口:点鼻子直接去网关续期(网关登录态还在则完全无感)
  function onNoseClick(event: React.MouseEvent) {
    const sso = ssoEntryUrl()
    if (connection === 'down' && sso) {
      event.preventDefault()
      window.location.href = sso
    }
  }

  return (
    <span className="relative size-7 shrink-0" title={connectionDetail} onClick={onNoseClick}>
      <Image
        src="/logo-mark.jpg"
        alt="pigcoder"
        width={28}
        height={28}
        className="size-7 rounded-full object-cover"
      />
      {connection === 'down' && (
        <span
          aria-hidden
          className="nose-alert absolute rounded-full"
          style={{
            left: '60%',
            top: '42%',
            width: '37%',
            height: '33%',
            background: '#ef4444',
            mixBlendMode: 'color'
          }}
        />
      )}
    </span>
  )
}

/** 余额胶囊(JWT 模式):随心跳刷新,点击去网关充值/看明细 */
function BalanceChip() {
  const { token, manualKey, balanceUsd } = modelsStore.useStore()
  if (!token || manualKey || balanceUsd === null) return null

  const home = gatewayHomeUrl()
  const text = `$${balanceUsd.toFixed(2)}`
  if (!home) {
    return <span className="glass-chip pointer-events-auto flex h-9 items-center px-3 font-mono text-xs font-semibold">{text}</span>
  }
  return (
    <a
      href={`${home}/dashboard`}
      target="_blank"
      rel="noreferrer"
      title="余额(点击去充值/看明细)"
      className="glass-chip pointer-events-auto flex h-9 items-center px-3 font-mono text-xs font-semibold transition-transform hover:-translate-y-0.5"
    >
      {text}
    </a>
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
          className="glass-chip pointer-events-auto inline-flex items-center gap-2 p-1.5 transition-transform hover:-translate-y-0.5 sm:pr-3"
        >
          <BrandMark />
          <span className="hidden text-sm font-bold tracking-tight sm:inline">pigcoder</span>
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
        <BalanceChip />
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
