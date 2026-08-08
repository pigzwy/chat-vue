'use client'

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Tooltip } from '@heroui/react'
import { useChat } from '@ai-sdk/react'
import { Chat as ChatClass } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { isFileUIPart } from 'ai'
import { Check, Copy, Pencil, RotateCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { ChatMessage } from '@/components/chat/message'
import { MessageEditBox } from '@/components/chat/message-edit'
import { Composer } from '@/components/chat/composer'
import { ModelMenu } from '@/components/chat/model-menu'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { useChatAttachments } from '@/hooks/use-attachments'
import { getChat, refreshChats, updateChatMessages, updateChatVotes, type LocalVote } from '@/lib/chats-store'
import { modelsStore } from '@/lib/models-store'
import { csrfHeaderName, getCsrfToken } from '@/lib/csrf'
import { toast } from '@/lib/toast'

function getMessageText(message: UIMessage) {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => ('text' in part ? part.text : ''))
    .join('')
}

/** 消息操作按钮：真实 button 经 Tooltip.Trigger 的 render 透传，文案与 aria-label 一致 */
function MessageAction({
  label,
  selected,
  onClick,
  children
}: {
  label: string
  selected?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger<'button'>
        aria-label={label}
        className="glass-pill p-1.5"
        onClick={onClick}
        render={props => <button {...props} data-selected={selected} type="button" />}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content className="glass-chip px-2.5 py-1.5 text-xs font-medium">
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  )
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const data = useMemo(() => getChat(id), [id])

  if (!data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-bold">对话不存在</h1>
        <Link href="/" className="glass-btn px-5 py-2 text-sm font-semibold">返回首页</Link>
      </div>
    )
  }

  return <ChatView data={data} />
}

function ChatView({ data }: { data: NonNullable<ReturnType<typeof getChat>> }) {
  const [input, setInput] = useState('')
  const [votes, setVotes] = useState<LocalVote[]>(data.votes ?? [])
  const [copiedId, setCopiedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { attachments, addFiles, removeAttachment, clearAttachments, validateAttachments, toMessageParts } = useChatAttachments()
  const { model } = modelsStore.useStore()

  // Chat 实例仅创建一次（惰性 state 初始化）；apiKey/model/effort 提交时从 store 现取
  const [chat] = useState(() =>
    new ChatClass<UIMessage>({
      id: data.id,
      messages: data.messages || [],
      transport: new DefaultChatTransport({
        api: `/api/chats/${data.id}`,
        headers: () => ({ [csrfHeaderName]: getCsrfToken() }),
        prepareSendMessagesRequest({ body, id: chatId, messageId, messages, trigger }) {
          const state = modelsStore.get()
          return {
            body: {
              ...body,
              id: chatId,
              messageId,
              messages,
              trigger,
              apiKey: state.apiKey,
              model: state.model,
              reasoningEffort: state.reasoningEffort
            }
          }
        }
      }),
      onFinish: ({ messages }) => {
        updateChatMessages(data.id, messages)
        refreshChats()
      },
      onError: (error) => {
        let message = error.message
        try {
          message = JSON.parse(message).message ?? message
        } catch { /* not JSON */ }
        toast({ description: message, color: 'error', duration: 0 })
      }
    })
  )

  const { messages, sendMessage, regenerate, stop, status } = useChat<UIMessage>({ chat })

  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStarted.current && data.isOwner && data.messages?.length === 1) {
      autoStarted.current = true
      void regenerate().catch(() => {})
    }
  }, [data, regenerate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const canSubmit = input.trim().length > 0 || attachments.length > 0

  function persist(next?: UIMessage[]) {
    updateChatMessages(data.id, next ?? chat.messages)
    refreshChats()
  }

  async function onSubmit() {
    const text = input.trim()
    if (!text && !attachments.length) return
    if (attachments.length && !validateAttachments(model)) return

    try {
      const attachmentParts = attachments.length ? await toMessageParts() : []
      const request = attachmentParts.length
        ? sendMessage({ parts: [...(text ? [{ type: 'text' as const, text }] : []), ...attachmentParts] })
        : sendMessage({ text })
      persist()
      void request.catch(() => persist())
      setInput('')
      clearAttachments()
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : '附件读取失败', color: 'error' })
    }
  }

  function getVote(messageId: string) {
    const vote = votes.find(item => item.messageId === messageId)
    return vote ? !!vote.isUpvoted : null
  }

  function onVote(message: UIMessage, isUpvoted: boolean) {
    const toggling = getVote(message.id) === isUpvoted
    const next = toggling
      ? votes.filter(item => item.messageId !== message.id)
      : [...votes.filter(item => item.messageId !== message.id), { chatId: data.id, messageId: message.id, isUpvoted }]
    setVotes(next)
    updateChatVotes(data.id, next)
  }

  function onCopy(message: UIMessage) {
    void navigator.clipboard.writeText(getMessageText(message))
    setCopiedId(message.id)
    setTimeout(() => setCopiedId(''), 2000)
  }

  function onRegenerate(message: UIMessage) {
    const request = regenerate({ messageId: message.id })
    persist()
    void request.catch(() => persist())
  }

  function onSaveEdit(message: UIMessage, text: string) {
    setEditingId('')
    const request = sendMessage({ text, messageId: message.id })
    persist()
    void request.catch(() => persist())
  }

  const streaming = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex min-h-0 flex-1">
      <ChatSidebar />
      <div className="glass-panel glass-panel--lg aurora-shell mx-4 mb-4 flex min-w-0 flex-1 flex-col lg:ml-0">
        <div className="flex justify-start p-4">
          <ModelMenu />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-6">
            {messages.map((message) => {
              const isLast = message.id === messages[messages.length - 1]?.id
              const isStreamingThis = streaming && isLast
              const isEditing = editingId === message.id && message.role === 'user'
              return (
                <div key={message.id} className="group/message">
                  {isEditing
                    ? (
                        <MessageEditBox
                          text={getMessageText(message)}
                          onSave={text => onSaveEdit(message, text)}
                          onCancel={() => setEditingId('')}
                        />
                      )
                    : <ChatMessage message={message} />}
                  {message.role === 'user' && !isEditing && !streaming && !message.parts.some(isFileUIPart) && (
                    <div className="mt-1 flex justify-end opacity-0 transition group-hover/message:opacity-100">
                      <MessageAction label="编辑消息" onClick={() => setEditingId(message.id)}>
                        <Pencil className="size-3.5" />
                      </MessageAction>
                    </div>
                  )}
                  {message.role === 'assistant' && !isStreamingThis && (
                    <div className="mt-1 flex gap-1 opacity-0 transition group-hover/message:opacity-100">
                      <MessageAction label="复制回答" onClick={() => onCopy(message)}>
                        {copiedId === message.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      </MessageAction>
                      <MessageAction label="回答不错" selected={getVote(message.id) === true} onClick={() => onVote(message, true)}>
                        <ThumbsUp className="size-3.5" />
                      </MessageAction>
                      <MessageAction label="回答欠佳" selected={getVote(message.id) === false} onClick={() => onVote(message, false)}>
                        <ThumbsDown className="size-3.5" />
                      </MessageAction>
                      <MessageAction label="重新生成" onClick={() => onRegenerate(message)}>
                        <RotateCw className="size-3.5" />
                      </MessageAction>
                    </div>
                  )}
                </div>
              )
            })}
            {streaming && messages[messages.length - 1]?.role === 'user' && (
              <p className="label-mono animate-pulse">思考中...</p>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="p-4">
          <div className="mx-auto max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={() => { void onSubmit() }}
              onStop={() => { void stop() }}
              status={status}
              attachments={attachments}
              onPickFiles={files => addFiles(files, model)}
              onRemoveAttachment={removeAttachment}
              canSubmit={canSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
