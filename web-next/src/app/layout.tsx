import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import { TopNav } from '@/components/top-nav'
import { Toaster } from '@/components/toaster'
import { AppInit } from '@/components/app-init'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin']
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: '对话 - PIG Coder',
  description: 'PIG Coder：AI 对话与图片、视频创作工作台。'
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* FOUC 防抖：与 Vue 版一致的暗色初始化 */}
        <Script id="color-scheme" strategy="beforeInteractive">
          {`(function () {
            var mode = localStorage.getItem('color-scheme') || 'auto'
            var dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
            if (dark) document.documentElement.classList.add('dark')
          })()`}
        </Script>
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AppInit />
        <TopNav />
        <Toaster />
        <main className="flex h-screen flex-col overflow-hidden pt-16">
          {children}
        </main>
      </body>
    </html>
  )
}
