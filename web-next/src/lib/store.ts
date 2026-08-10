import { useSyncExternalStore } from 'react'

/**
 * 极简外部 store：模块级单例状态 + useSyncExternalStore 订阅（替代 Vue 的 createSharedComposable）。
 * serverSnapshot：SSR/水合期使用的快照。store 初始态若读 localStorage，服务端与客户端
 * 首帧必然不同——提供与服务端渲染结果一致的快照后，React 会在水合完成后静默重渲染到
 * 客户端真实状态，而不是报 hydration mismatch。
 */
export function createStore<T>(initial: T, options?: { serverSnapshot?: T }) {
  let state = initial
  const listeners = new Set<() => void>()
  const serverSnapshot = options?.serverSnapshot

  function get() {
    return state
  }

  const getServerSnapshot = serverSnapshot === undefined ? get : () => serverSnapshot

  function set(next: T | ((prev: T) => T)) {
    state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
    listeners.forEach(listener => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, get, getServerSnapshot)
  }

  return { get, set, subscribe, useStore }
}
