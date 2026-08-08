import { Button } from '@heroui/react'

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="glass-orb flex size-14 items-center justify-center rounded-3xl text-2xl">
        ✨
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          React 版工作台
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 opacity-70 sm:text-base">
          Next.js + HeroUI 骨架已就绪。聊天页迁移中（R2），当前线上服务仍由 Vue 版提供。
        </p>
      </div>
      <div className="glass-panel w-full max-w-xl p-6 text-left">
        <p className="label-mono mb-3">迁移进度</p>
        <ul className="space-y-2 text-sm">
          <li>✅ R1 工程骨架 · 玻璃拟态 token · 路由 · 后端桥接</li>
          <li>⏳ R2 聊天页（@ai-sdk/react 流式）</li>
          <li>⏳ R3 创作台（图片/视频/引用/批量）</li>
          <li>⏳ R4 灵感墙 + 回归切换</li>
        </ul>
      </div>
      <Button className="glass-btn px-6">HeroUI 组件冒烟：这是一颗 Button</Button>
    </div>
  )
}
