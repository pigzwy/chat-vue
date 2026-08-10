'use client'

import { useCallback, useRef } from 'react'
import { ArrowUp, Paperclip, Square, X } from 'lucide-react'
import { chatAttachmentAccept, chatAttachmentLimit, formatFileSize, isImageMediaType } from '@/lib/attachments'
import type { ChatAttachment } from '@/hooks/use-attachments'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  status?: 'ready' | 'submitted' | 'streaming' | 'error'
  attachments: ChatAttachment[]
  onPickFiles: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  canSubmit: boolean
  large?: boolean
  placeholder?: string
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  status = 'ready',
  attachments,
  onPickFiles,
  onRemoveAttachment,
  canSubmit,
  large,
  placeholder = '输入消息...'
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const busy = status === 'streaming' || status === 'submitted'

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSubmit && !busy) onSubmit()
    }
  }

  function onFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    onPickFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }

  function onPaste(event: React.ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files || [])
    if (files.length) {
      event.preventDefault()
      onPickFiles(files)
    }
  }

  return (
    <div className="glass-input p-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto p-1">
          {attachments.map(attachment => (
            <div
              key={attachment.id}
              className="glass-card-hover group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              title={attachment.name}
            >
              {attachment.previewUrl && isImageMediaType(attachment.mediaType)
                ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.previewUrl} alt={attachment.name} className="size-full object-cover" />
                  )
                : (
                    <div className="px-1 text-center">
                      <p className="max-w-full truncate text-[10px] font-medium">{attachment.name}</p>
                      <p className="text-[9px] opacity-60">{formatFileSize(attachment.size)}</p>
                    </div>
                  )}
              <button
                type="button"
                aria-label="移除附件"
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition pointer-coarse:opacity-100 group-hover:opacity-100"
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        rows={large ? 3 : 2}
        placeholder={placeholder}
        className={`w-full resize-none bg-transparent p-1 outline-none placeholder:opacity-50 ${large ? 'text-base' : 'text-sm'}`}
        onChange={(event) => {
          onChange(event.target.value)
          resize()
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />

      <div className="mt-2 flex items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={chatAttachmentAccept}
            className="hidden"
            onChange={onFilesChange}
          />
          <button
            type="button"
            aria-label="添加附件"
            disabled={busy || attachments.length >= chatAttachmentLimit}
            className="glass-pill flex h-8 items-center gap-1 px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-3.5" />
            {attachments.length > 0 && `${attachments.length}/${chatAttachmentLimit}`}
          </button>
          <span className="label-mono hidden normal-case sm:inline">
            Enter 发送 · Shift+Enter 换行
          </span>
        </div>

        {busy && onStop
          ? (
              <button
                type="button"
                aria-label="停止生成"
                className="glass-btn flex size-9 items-center justify-center"
                onClick={onStop}
              >
                <Square className="size-3.5 fill-current" />
              </button>
            )
          : (
              <button
                type="button"
                aria-label="发送"
                disabled={!canSubmit || busy}
                className="glass-btn flex size-9 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
                onClick={onSubmit}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
      </div>
    </div>
  )
}
