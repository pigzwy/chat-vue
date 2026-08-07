<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useModels } from '../../composables/useModels'
import { useChats, type LocalVote } from '../../composables/useChats'
import { useCsrf } from '../../composables/useCsrf'
import { useRoute } from 'vue-router'
import ChatMessageContent from '../../components/chat/message/MessageContent.vue'
import ChatMessageActions from '../../components/chat/message/MessageActions.vue'
import ChatIndicator from '../../components/chat/Indicator.vue'
import ChatComposer from '../../components/chat/ChatComposer.vue'
import Navbar from '../../components/Navbar.vue'
import PromptPresetRow from '../../components/PromptPresetRow.vue'
import { chatFollowupPresets } from '../../data/promptPresets'
import { useChatAttachments } from '../../composables/useChatAttachments'

const route = useRoute<'/chat/[id]'>()
const toast = useToast()
const { apiKey, model, reasoningEffort } = useModels()
const { fetchChats, getChat, updateChatMessages, updateChatVotes } = useChats()
const { csrf, headerName } = useCsrf()

const data = ref(getChat(route.params.id as string))

const isOwner = computed(() => data.value?.isOwner ?? false)

const votes = ref<LocalVote[]>(data.value?.votes ?? [])

const input = ref('')
const attachmentPending = ref(false)
const {
  attachments,
  hasAttachments,
  addFiles,
  removeAttachment,
  clearAttachments,
  validateAttachments,
  toMessageParts
} = useChatAttachments()

const chat = new Chat({
  id: data.value?.id,
  messages: data.value?.messages || [],
  transport: new DefaultChatTransport({
    api: `/api/chats/${data.value?.id}`,
    headers: { [headerName]: csrf() },
    prepareSendMessagesRequest({ body, id, messageId, messages, trigger }) {
      return {
        body: {
          ...body,
          id,
          messageId,
          messages,
          trigger,
          apiKey: apiKey.value,
          model: model.value,
          reasoningEffort: reasoningEffort.value
        }
      }
    }
  }),
  onData: (dataPart) => {
    if (dataPart.type === 'data-chat-title') {
      void fetchChats()
    }
  },
  onFinish({ messages }) {
    persistMessages(messages)
  },
  onError(error) {
    let message = error.message
    if (typeof message === 'string') {
      try { message = JSON.parse(message).message ?? message } catch { /* not JSON */ }
    }
    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
})

const canSendMessage = computed(() => input.value.trim().length > 0 || hasAttachments.value)

function persistMessages(messages = chat.messages) {
  if (!data.value?.id) return

  updateChatMessages(data.value.id, messages)
  data.value = getChat(data.value.id)
  void fetchChats()
}

function onAttachmentFiles(files: File[]) {
  addFiles(files, model.value)
}

function useChatPromptPreset(prompt: string) {
  if (chat.status !== 'ready') return
  input.value = prompt
}

async function handleSubmit(e?: Event) {
  e?.preventDefault()
  const text = input.value.trim()
  if (!text && !hasAttachments.value) return

  attachmentPending.value = true
  try {
    if (hasAttachments.value && !validateAttachments(model.value)) return

    const attachmentParts = hasAttachments.value ? await toMessageParts() : []
    const request = attachmentParts.length
      ? chat.sendMessage({
        parts: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...attachmentParts
        ]
      })
      : chat.sendMessage({ text })
    persistMessages()
    void request.catch(() => persistMessages())

    input.value = ''
    clearAttachments()
  } catch (error) {
    toast.add({
      description: error instanceof Error ? error.message : '附件读取失败',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  } finally {
    attachmentPending.value = false
  }
}

const editingMessageId = ref<string | null>(null)

function startEdit(message: UIMessage) {
  if (editingMessageId.value) return

  editingMessageId.value = message.id
}

function cancelEdit() {
  editingMessageId.value = null
}

async function saveEdit(message: UIMessage, text: string) {
  editingMessageId.value = null
  const request = chat.sendMessage({ text, messageId: message.id })
  persistMessages()
  void request.catch(() => persistMessages())
}

async function regenerateMessage(message: UIMessage) {
  const request = chat.regenerate({ messageId: message.id })
  persistMessages()
  void request.catch(() => persistMessages())
}

function getVote(messageId: string) {
  const vote = votes.value.find(v => v.messageId === messageId)
  if (!vote) return null
  return !!vote.isUpvoted
}

async function vote(message: UIMessage, isUpvoted: boolean) {
  const toggling = getVote(message.id) === isUpvoted
  const next = toggling ? null : isUpvoted

  votes.value = next === null
    ? votes.value.filter(v => v.messageId !== message.id)
    : [
        ...votes.value.filter(v => v.messageId !== message.id),
        { chatId: data.value!.id, messageId: message.id, isUpvoted: next }
      ]

  updateChatVotes(data.value!.id, votes.value)
}

onMounted(() => {
  if (isOwner.value && data.value?.messages?.length === 1) {
    const request = chat.regenerate()
    void request.catch(() => persistMessages())
  }
})
</script>

<template>
  <UDashboardPanel
    v-if="data?.id"
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <Navbar />
    </template>

    <template #body>
      <UContainer class="relative flex-1 flex flex-col gap-4 sm:gap-6">
        <div class="pointer-events-none absolute inset-x-10 top-8 h-24 rounded-full bg-primary/8 blur-3xl" />
        <UChatMessages
          should-auto-scroll
          :messages="chat.messages"
          :status="chat.status"
          :spacing-offset="isOwner ? 160 : 0"
          class="relative pt-(--ui-header-height) pb-4 sm:pb-6"
        >
          <template #indicator>
            <div class="flex items-center gap-1.5">
              <ChatIndicator />

              <UChatShimmer
                text="思考中..."
                class="text-sm"
              />
            </div>
          </template>

          <template #content="{ message }">
            <ChatMessageContent
              :message="message"
              :editing="isOwner && editingMessageId === message.id"
              @save="saveEdit"
              @cancel-edit="cancelEdit"
            />
          </template>

          <template
            v-if="isOwner"
            #actions="{ message }"
          >
            <div :class="message.role === 'assistant' ? 'ml-12' : undefined">
              <ChatMessageActions
                :message="message"
                :streaming="chat.status === 'streaming' && message.id === chat.messages[chat.messages.length - 1]?.id"
                :editing="editingMessageId === message.id"
                :vote="getVote(message.id)"
                @edit="startEdit"
                @regenerate="regenerateMessage"
                @vote="vote"
              />
            </div>
          </template>
        </UChatMessages>

        <div
          v-if="isOwner"
          class="sticky bottom-4 z-10 space-y-2"
        >
          <PromptPresetRow
            v-if="!attachments.length && !input.trim()"
            class="mx-auto max-w-3xl px-2"
            :presets="chatFollowupPresets"
            :disabled="chat.status !== 'ready'"
            @select="useChatPromptPreset"
          />

          <ChatComposer
            v-model="input"
            :status="chat.status"
            :error="chat.error"
            :attachments="attachments"
            :attachment-pending="attachmentPending"
            :can-submit="canSendMessage"
            @submit="handleSubmit"
            @stop="chat.stop()"
            @reload="chat.regenerate()"
            @files="onAttachmentFiles"
            @remove-attachment="removeAttachment"
          />
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>

  <UContainer
    v-else
    class="flex-1 flex flex-col gap-4 sm:gap-6"
  >
    <UError
      :error="{ statusMessage: '对话不存在', statusCode: 404 }"
      class="min-h-full"
    >
      <template #links>
        <UButton
          to="/"
          size="lg"
          label="返回首页"
        />
      </template>
    </UError>
  </UContainer>
</template>
