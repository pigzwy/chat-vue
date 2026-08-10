'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import type { UIMessage } from 'ai'
import { Composer } from '@/components/chat/composer'
import { ModelMenu } from '@/components/chat/model-menu'
import { PresetRow } from '@/components/chat/preset-row'
import { ChatSidebar, SidebarOpenButton } from '@/components/chat/chat-sidebar'
import { useChatAttachments } from '@/hooks/use-attachments'
import { createChat, refreshChats } from '@/lib/chats-store'
import { modelsStore } from '@/lib/models-store'
import { homeQuickPrompts } from '@/lib/presets'
import { toast } from '@/lib/toast'

export default function HomePage() {
  const router = useRouter()
  const { model } = modelsStore.useStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const { attachments, addFiles, removeAttachment, clearAttachments, validateAttachments, toMessageParts } = useChatAttachments()

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return '早上好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  const canSubmit = input.trim().length > 0 || attachments.length > 0

  async function onSubmit() {
    const text = input.trim()
    if (!text && !attachments.length) return

    setLoading(true)
    try {
      if (attachments.length && !validateAttachments(model)) return

      const attachmentParts = attachments.length ? await toMessageParts() : []
      const parts: UIMessage['parts'] | undefined = attachmentParts.length
        ? [...(text ? [{ type: 'text' as const, text }] : []), ...attachmentParts]
        : undefined

      const chat = createChat(text, parts)
      clearAttachments()
      refreshChats()
      router.push(`/chat/${chat.id}`)
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : '创建对话失败',
        color: 'error'
      })
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ChatSidebar />
      <div className="glass-panel glass-panel--lg aurora-shell mx-4 mb-4 flex min-w-0 flex-1 flex-col lg:ml-0">
        <div className="flex items-center gap-1 p-4">
          <SidebarOpenButton />
          <ModelMenu />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-7 px-4 pb-10">
          <div className="text-center">
            <div className="glass-orb mx-auto mb-5 flex size-14 items-center justify-center rounded-3xl">
              <Sparkles className="size-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{greeting}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 opacity-60 sm:text-base">
              输入问题、上传资料，或从下方选择一个常用场景开始。
            </p>
          </div>

          <Composer
            large
            value={input}
            onChange={setInput}
            onSubmit={() => { void onSubmit() }}
            status={loading ? 'submitted' : 'ready'}
            attachments={attachments}
            onPickFiles={files => addFiles(files, model)}
            onRemoveAttachment={removeAttachment}
            canSubmit={canSubmit && !loading}
          />

          <PresetRow
            presets={homeQuickPrompts}
            disabled={loading}
            center
            onSelect={prompt => setInput(prompt)}
          />
        </div>
      </div>
    </div>
  )
}
