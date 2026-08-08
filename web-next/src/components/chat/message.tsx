'use client'

import { useMemo, useState } from 'react'
import type { UIMessage } from 'ai'
import { isFileUIPart, isReasoningUIPart, isTextUIPart, isToolUIPart, getToolName } from 'ai'
import { Brain, ChevronDown, Wrench } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { getMergedParts } from '@/lib/message-parts'
import { isImageMediaType } from '@/lib/attachments'

function ReasoningBlock({ text, streaming }: { text: string, streaming: boolean }) {
  const [open, setOpen] = useState(false)
  const expanded = open || streaming

  return (
    <div className="glass-panel my-2 overflow-hidden rounded-xl text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold opacity-70"
        onClick={() => setOpen(value => !value)}
      >
        <Brain className={`size-3.5 ${streaming ? 'animate-pulse' : ''}`} />
        {streaming ? '思考中...' : '思考过程'}
        <ChevronDown className={`ml-auto size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-black/5 px-3 py-2 text-xs leading-5 opacity-70 dark:border-white/5">
          <Streamdown>{text}</Streamdown>
        </div>
      )}
    </div>
  )
}

function ToolBlock({ name, streaming }: { name: string, streaming: boolean }) {
  return (
    <div className="glass-panel my-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold opacity-70">
      <Wrench className={`size-3.5 ${streaming ? 'animate-pulse' : ''}`} />
      {streaming ? `正在调用工具 ${name}...` : `已调用工具 ${name}`}
    </div>
  )
}

function isPartStreaming(part: { state?: string }) {
  return part.state === 'streaming'
}

export function ChatMessage({ message }: { message: UIMessage }) {
  const parts = useMemo(() => getMergedParts(message.parts), [message.parts])
  const isUser = message.role === 'user'

  const fileParts = useMemo(
    () => (isUser ? message.parts.filter(isFileUIPart) : []),
    [isUser, message.parts]
  )

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-2">
        {fileParts.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {fileParts.map((file, index) => (
              isImageMediaType(file.mediaType)
                ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={index}
                      src={file.url}
                      alt={file.filename || '附件'}
                      className="size-32 rounded-xl border border-black/5 object-cover dark:border-white/10"
                    />
                  )
                : (
                    <div key={index} className="glass-panel max-w-64 truncate rounded-xl px-3 py-2 text-xs">
                      {file.filename || file.mediaType}
                    </div>
                  )
            ))}
          </div>
        )}
        <div className="glass-panel max-w-[75%] rounded-3xl px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          {parts.filter(isTextUIPart).map(part => part.text).join('')}
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 text-sm leading-7">
      {parts.map((part, index) => {
        if (isReasoningUIPart(part)) {
          return <ReasoningBlock key={index} text={part.text} streaming={isPartStreaming(part)} />
        }
        if (isToolUIPart(part)) {
          return <ToolBlock key={index} name={getToolName(part)} streaming={part.state !== 'output-available' && part.state !== 'output-error'} />
        }
        if (isTextUIPart(part)) {
          return (
            <div key={index} className="prose-chat">
              <Streamdown>{part.text}</Streamdown>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
