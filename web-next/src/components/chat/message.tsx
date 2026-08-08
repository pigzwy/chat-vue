'use client'

import { useMemo } from 'react'
import type { UIMessage } from 'ai'
import { isFileUIPart, isReasoningUIPart, isTextUIPart, isToolUIPart, getToolName } from 'ai'
import { ChainOfThought } from '@heroui-pro/react/chain-of-thought'
import { ChatMessage as ProChatMessage } from '@heroui-pro/react/chat-message'
import { ChatTool } from '@heroui-pro/react/chat-tool'
import { Streamdown } from 'streamdown'
import { getMergedParts } from '@/lib/message-parts'
import { isImageMediaType } from '@/lib/attachments'

function isPartStreaming(part: { state?: string }) {
  return part.state === 'streaming'
}

/** 推理块:Pro ChainOfThought(流式时触发器闪烁,内容折叠) */
function ReasoningBlock({ text, streaming }: { text: string, streaming: boolean }) {
  return (
    <ChainOfThought isStreaming={streaming} defaultExpanded={streaming} className="my-2">
      <ChainOfThought.Trigger>{streaming ? '思考中...' : '思考过程'}</ChainOfThought.Trigger>
      <ChainOfThought.Content>
        <div className="prose-chat text-xs leading-5 opacity-80">
          <Streamdown>{text}</Streamdown>
        </div>
      </ChainOfThought.Content>
    </ChainOfThought>
  )
}

// AI SDK 的 tool state → Pro ChatTool 的 ToolPartState(审批类中间态归并到进行中/完成)
type ProToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'requires-action'
function toProToolState(state: string): ProToolState {
  switch (state) {
    case 'input-streaming': return 'input-streaming'
    case 'output-available': return 'output-available'
    case 'output-error':
    case 'output-denied': return 'output-error'
    case 'approval-requested': return 'requires-action'
    default: return 'input-available'
  }
}

/** 工具调用块:Pro ChatTool preset(按 state 自动渲染状态图标与折叠) */
function ToolBlock({ part }: { part: UIMessage['parts'][number] & { type: string } }) {
  if (!isToolUIPart(part)) return null
  return (
    <ChatTool
      className="my-2"
      state={toProToolState(part.state)}
      toolName={getToolName(part)}
      toolCallId={part.toolCallId}
      input={'input' in part ? part.input : undefined}
      output={'output' in part ? part.output : undefined}
      errorText={part.state === 'output-error' ? part.errorText : undefined}
    />
  )
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
      <ProChatMessage.User>
        {fileParts.length > 0 && (
          <ProChatMessage.Media className="flex flex-wrap justify-end gap-2">
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
          </ProChatMessage.Media>
        )}
        <ProChatMessage.Bubble className="glass-panel max-w-[75%] rounded-3xl px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          {parts.filter(isTextUIPart).map(part => part.text).join('')}
        </ProChatMessage.Bubble>
      </ProChatMessage.User>
    )
  }

  return (
    <ProChatMessage.Assistant>
      <ProChatMessage.Body className="min-w-0 text-sm leading-7">
        {parts.map((part, index) => {
          if (isReasoningUIPart(part)) {
            return <ReasoningBlock key={index} text={part.text} streaming={isPartStreaming(part)} />
          }
          if (isToolUIPart(part)) {
            return <ToolBlock key={index} part={part} />
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
      </ProChatMessage.Body>
    </ProChatMessage.Assistant>
  )
}
