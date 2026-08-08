'use client'

import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/**
 * 水合完成标记：服务端/水合首帧为 false，客户端为 true。
 * 用于必须读 localStorage 才能渲染的页面（如按 id 取本地会话），
 * 首帧渲染骨架屏,水合后 React 自动重渲染真实内容,不产生 mismatch。
 */
export function useHydrated() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}
