'use client'

import { confirmStore, resolveConfirm } from '@/lib/confirm-store'

/** promise 式确认弹窗（对应 Vue 版 useOverlay + ModalConfirm），由 confirm-store 驱动 */
export function ConfirmDialog() {
  const { request } = confirmStore.useStore()
  if (!request) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={request.title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="glass-panel glass-panel--lg relative w-full max-w-sm p-5 animate-fade-scale">
        <h2 className="text-base font-bold">{request.title}</h2>
        <p className="mt-2 text-sm leading-6 opacity-70">{request.description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="glass-pill px-4 py-2 text-sm font-semibold"
            onClick={() => resolveConfirm(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600"
            onClick={() => resolveConfirm(true)}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
