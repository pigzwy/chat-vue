import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Noto_Sans_SC } from 'next/font/google'
import Script from 'next/script'
import { Toaster } from '@/components/toaster'
import { AppInit } from '@/components/app-init'
import { AppShell } from '@/components/app-shell'
import './globals.css'

/* 中文正文字体(Noto Sans SC,unicode-range 分片按需加载);拉丁走 Geist */
const notoSansSC = Noto_Sans_SC({
  variable: '--font-noto-sc',
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  preload: false
})

export const metadata: Metadata = {
  // 各分区(创作台/语音/灵感墙)经各自 layout 的 title 套进模板
  title: {
    default: '对话 · PIG Coder',
    template: '%s · PIG Coder'
  },
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
      <body className={`${GeistSans.variable} ${GeistMono.variable} ${notoSansSC.variable} font-sans antialiased`}>
        <AppInit />
        <Toaster />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
