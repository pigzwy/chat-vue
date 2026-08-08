'use client'

import type { ReactNode } from 'react'
import { TopNav } from '@/components/top-nav'
import { LoginScreen } from '@/components/login-screen'
import { useHydrated } from '@/hooks/use-hydrated'
import { modelsStore } from '@/lib/models-store'

/** 登录门:未登录展示登录页,登录后展示顶部导航 + 应用内容 */
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()
  const { token, authChecked } = modelsStore.useStore()

  // 水合前 / 初始 token 校验中:占位骨架,避免闪登录页或 hydration 不匹配
  if (!hydrated || !authChecked) {
    return (
      <main className="flex h-screen flex-col overflow-hidden">
        <div className="aurora-shell flex flex-1 items-center justify-center">
          <div className="glass-orb size-14 animate-pulse rounded-3xl" />
        </div>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="flex h-screen flex-col overflow-hidden">
        <LoginScreen />
      </main>
    )
  }

  return (
    <>
      <TopNav />
      <main className="flex h-screen flex-col overflow-hidden pt-16">
        {children}
      </main>
    </>
  )
}
