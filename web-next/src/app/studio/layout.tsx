import type { Metadata } from 'next'

// 页面组件是客户端组件,浏览器 tab 标题由分区 layout 声明
export const metadata: Metadata = { title: '创作台' }

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children
}
