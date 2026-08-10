'use client'

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChatMessage as ProChatMessage } from '@heroui-pro/react/chat-message'
import { ArrowDown, Sparkles } from 'lucide-react'
import { useHydrated } from '@/hooks/use-hydrated'
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom'
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
import { ChatSidebar, SidebarOpenButton } from '@/components/chat/chat-sidebar'
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

/** 消息操作按钮：Pro ChatMessage.Action(自带 tooltip / 按压反馈)，选中态用玻璃高亮 */
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
    <ProChatMessage.Action
      aria-label={label}
      tooltip={label}
      data-selected={selected}
      className="glass-pill"
      onPress={onClick}
    >
      {children}
    </ProChatMessage.Action>
  )
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // 会话存在 localStorage,服务端渲染读不到:水合前渲染骨架,水合后再取数
  const hydrated = useHydrated()
  const data = useMemo(() => (hydrated ? getChat(id) : undefined), [hydrated, id])

  if (data === undefined) {
    return (
      <div className="flex min-h-0 flex-1">
        <ChatSidebar />
        <div className="glass-panel glass-panel--lg aurora-shell mx-4 mb-4 flex min-w-0 flex-1 flex-col p-4 lg:ml-0">
          <div className="shimmer-block h-9 w-40 rounded-full" />
          <div className="mx-auto mt-10 flex w-full max-w-3xl flex-col gap-4">
            <div className="shimmer-block ml-auto h-10 w-1/2 rounded-3xl" />
            <div className="shimmer-block h-24 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

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
  const { containerRef, isAtBottom, scrollToBottom } = useScrollToBottom()
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
        <div className="flex items-center gap-1 p-4">
          <SidebarOpenButton />
          <ModelMenu />
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={containerRef} className="absolute inset-0 touch-pan-y overflow-y-auto px-4 sm:px-8">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 pb-6">
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
                    <ProChatMessage.Actions className="mt-1 flex justify-end opacity-0 transition group-hover/message:opacity-100 pointer-coarse:opacity-100">
                      <MessageAction label="编辑消息" onClick={() => setEditingId(message.id)}>
                        <Pencil className="size-3.5" />
                      </MessageAction>
                    </ProChatMessage.Actions>
                  )}
                  {message.role === 'assistant' && !isStreamingThis && (
                    <ProChatMessage.Actions className="mt-1 flex gap-1 opacity-0 transition group-hover/message:opacity-100 pointer-coarse:opacity-100">
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
                    </ProChatMessage.Actions>
                  )}
                </div>
              )
            })}
              {streaming && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex items-center gap-2 text-sm opacity-70">
                  <Sparkles className="size-4 animate-pulse" />
                  <span className="label-mono animate-pulse">思考中...</span>
                </div>
              )}
              <div className="min-h-6 shrink-0" />
            </div>
          </div>

          <button
            type="button"
            aria-label="回到底部"
            className={`glass-chip absolute bottom-3 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center transition-all duration-200 ${
              isAtBottom ? 'pointer-events-none scale-90 opacity-0' : 'scale-100 opacity-100'
            }`}
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="size-4" />
          </button>
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
