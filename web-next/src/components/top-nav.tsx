'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const tabs = [
  { label: '对话', href: '/', icon: '💬' },
  { label: '创作台', href: '/studio', icon: '✨' },
  { label: '灵感', href: '/gallery', icon: '💡' }
] as const

function isTabActive(pathname: string, href: string) {
  if (href === '/') {
    return !pathname.startsWith('/studio') && !pathname.startsWith('/gallery')
  }
  return pathname.startsWith(href)
}

function ColorModeButton() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

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
      className="glass-chip pointer-events-auto flex size-9 items-center justify-center"
      onClick={toggle}
    >
      {dark ? '🌙' : '☀️'}
    </button>
  )
}

export function TopNav() {
  const pathname = usePathname()

  return (
    <>
      <div className="pointer-events-none fixed left-4 top-3 z-50">
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
          <span className="hidden text-sm font-bold tracking-tight sm:inline">pigcoder</span>
        </Link>
      </div>

      <nav className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2">
        <div className="glass-chip pointer-events-auto inline-flex items-center gap-1 p-1">
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              data-selected={isTabActive(pathname, tab.href)}
              className="glass-pill inline-flex h-8 items-center gap-1.5 px-3.5 text-sm font-semibold"
            >
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="pointer-events-none fixed right-4 top-3 z-50">
        <ColorModeButton />
      </div>
    </>
  )
}
