import { useSyncExternalStore } from 'react'

/** 极简外部 store：模块级单例状态 + useSyncExternalStore 订阅（替代 Vue 的 createSharedComposable） */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()

  function get() {
    return state
  }

  function set(next: T | ((prev: T) => T)) {
    state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
    listeners.forEach(listener => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, get, get)
  }

  return { get, set, subscribe, useStore }
}
