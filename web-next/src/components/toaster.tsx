'use client'

import { X } from 'lucide-react'
import { dismissToast, toastStore } from '@/lib/toast'

const colorClasses: Record<string, string> = {
  warning: 'border-amber-500/30',
  error: 'border-red-500/30',
  success: 'border-emerald-500/30',
  default: ''
}

export function Toaster() {
  const toasts = toastStore.useStore()
  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-100 flex w-80 flex-col gap-2">
      {toasts.map(item => (
        <div
          key={item.id}
          className={`glass-panel pointer-events-auto flex items-start gap-2 p-3 text-sm animate-fade-scale ${colorClasses[item.color || 'default']}`}
        >
          <div className="min-w-0 flex-1">
            {item.title && <p className="font-semibold">{item.title}</p>}
            <p className="opacity-80">{item.description}</p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="shrink-0 opacity-50 hover:opacity-100"
            onClick={() => dismissToast(item.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
