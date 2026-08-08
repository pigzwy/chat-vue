import { createStore } from '@/lib/store'

/** promise 式确认弹窗（替代 Vue 版 useOverlay + ModalConfirm），UI 由 ConfirmDialog 组件渲染 */
export interface ConfirmRequest {
  title: string
  description: string
}

interface ConfirmState {
  request: ConfirmRequest | null
}

export const confirmStore = createStore<ConfirmState>({ request: null })

let pendingResolve: ((value: boolean) => void) | null = null

export function requestConfirm(request: ConfirmRequest) {
  // 已有弹窗时直接拒绝新请求，避免 resolve 被覆盖后旧 promise 悬挂
  if (pendingResolve) return Promise.resolve(false)

  confirmStore.set({ request })
  return new Promise<boolean>((resolve) => {
    pendingResolve = resolve
  })
}

export function resolveConfirm(value: boolean) {
  confirmStore.set({ request: null })
  pendingResolve?.(value)
  pendingResolve = null
}
