'use client'

import { useState } from 'react'

/** 用户消息就地编辑框：保存后从该消息起重发（对齐 Vue 版 MessageEdit） */
export function MessageEditBox({ text, onSave, onCancel }: {
  text: string
  onSave: (next: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(text)
  const canSave = value.trim().length > 0 && value !== text

  return (
    <div className="ml-auto flex w-full max-w-[75%] flex-col gap-2">
      <textarea
        autoFocus
        rows={Math.min(8, Math.max(2, value.split('\n').length))}
        value={value}
        className="glass-input w-full resize-none rounded-2xl px-4 py-2.5 text-sm leading-6 outline-none"
        onChange={event => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSave) onSave(value)
        }}
      />
      <div className="flex justify-end gap-1.5">
        <button type="button" className="glass-pill px-3 py-1.5 text-xs font-semibold" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="glass-btn px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          disabled={!canSave}
          onClick={() => onSave(value)}
        >
          保存
        </button>
      </div>
    </div>
  )
}
