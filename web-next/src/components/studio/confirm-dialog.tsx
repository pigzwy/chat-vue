'use client'

import { AlertDialog } from '@heroui/react'
import { confirmStore, resolveConfirm } from '@/lib/confirm-store'

/** promise 式确认弹窗（对应 Vue 版 useOverlay + ModalConfirm），由 confirm-store 驱动 */
export function ConfirmDialog() {
  const { request } = confirmStore.useStore()
  if (!request) return null

  return (
    <AlertDialog.Backdrop
      isOpen
      onOpenChange={(value) => { if (!value) resolveConfirm(false) }}
      className="z-100 bg-black/40 backdrop-blur-sm"
    >
      <AlertDialog.Container placement="center" className="w-full sm:w-full sm:p-4">
        <AlertDialog.Dialog aria-label={request.title} className="glass-panel glass-panel--lg w-full max-w-sm p-5">
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
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
