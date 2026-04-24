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
import ChatAttachmentPreviewList from '../../components/chat/AttachmentPreviewList.vue'
import Navbar from '../../components/Navbar.vue'
import ReasoningEffortSelect from '../../components/ReasoningEffortSelect.vue'
import { chatAttachmentAccept, chatAttachmentLimit } from '../../utils/chatAttachments'
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
const attachmentInput = ref<HTMLInputElement | null>(null)
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
    const { message } = typeof error.message === 'string' && error.message[0] === '{' ? JSON.parse(error.message) : error
    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
})

function persistMessages(messages = chat.messages) {
  if (!data.value?.id) return

  // 聊天消息已停用 SQL 入库，流式结束后直接写入浏览器 localStorage。
  updateChatMessages(data.value.id, messages)
  data.value = getChat(data.value.id)
  void fetchChats()
}

function pickAttachmentFiles() {
  if (chat.status !== 'ready') return
  attachmentInput.value?.click()
}

function onAttachmentFilesChange(event: Event) {
  const target = event.target as HTMLInputElement
  addFiles(Array.from(target.files || []), model.value)
  target.value = ''
}

async function handleSubmit(e?: Event) {
  e?.preventDefault()
  const text = input.value.trim()
  if (!text && !hasAttachments.value) return

  attachmentPending.value = true
  try {
    if (hasAttachments.value && !validateAttachments(model.value)) return

    const attachmentParts = hasAttachments.value ? await toMessageParts() : []
    if (attachmentParts.length) {
      const request = chat.sendMessage({
        parts: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...attachmentParts
        ]
      })
      persistMessages()
      void request.catch(() => persistMessages())
    } else {
      const request = chat.sendMessage({ text })
      persistMessages()
      void request.catch(() => persistMessages())
    }
    input.value = ''
    clearAttachments()
  } catch (error) {
    toast.add({
      description: error instanceof Error ? error.message : 'Failed to read attachments',
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
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
        <UChatMessages
          should-auto-scroll
          :messages="chat.messages"
          :status="chat.status"
          :spacing-offset="isOwner ? 160 : 0"
          class="pt-(--ui-header-height) pb-4 sm:pb-6"
        >
          <template #indicator>
            <div class="flex items-center gap-1.5">
              <ChatIndicator />

              <UChatShimmer
                text="Thinking..."
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
            <ChatMessageActions
              :message="message"
              :streaming="chat.status === 'streaming' && message.id === chat.messages[chat.messages.length - 1]?.id"
              :editing="editingMessageId === message.id"
              :vote="getVote(message.id)"
              @edit="startEdit"
              @regenerate="regenerateMessage"
              @vote="vote"
            />
          </template>
        </UChatMessages>

        <UChatPrompt
          v-if="isOwner"
          v-model="input"
          :error="chat.error"
          variant="subtle"
          class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
          :ui="{ base: 'px-1.5', footer: 'flex flex-wrap items-center justify-between gap-3 border-t border-default pt-2' }"
          @submit="handleSubmit"
        >
          <template
            v-if="attachments.length"
            #header
          >
            <ChatAttachmentPreviewList
              :attachments="attachments"
              :disabled="chat.status !== 'ready' || attachmentPending"
              @remove="removeAttachment"
            />
          </template>

          <template #footer>
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <ModelSelect />

              <ReasoningEffortSelect />

              <input
                ref="attachmentInput"
                type="file"
                multiple
                :accept="chatAttachmentAccept"
                class="hidden"
                @change="onAttachmentFilesChange"
              >
              <UTooltip text="Add attachments">
                <UButton
                  type="button"
                  icon="i-lucide-paperclip"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="shrink-0 rounded-full"
                  :label="attachments.length ? `${attachments.length}/${chatAttachmentLimit}` : undefined"
                  :disabled="chat.status !== 'ready' || attachmentPending || attachments.length >= chatAttachmentLimit"
                  aria-label="Add attachments"
                  @click="pickAttachmentFiles"
                />
              </UTooltip>
            </div>

            <div class="flex shrink-0 items-center">
              <UChatPromptSubmit
                :status="chat.status"
                icon="i-lucide-arrow-up"
                color="neutral"
                size="sm"
                class="shrink-0 rounded-full"
                :type="hasAttachments ? 'button' : undefined"
                :disabled="attachmentPending"
                @click="chat.status === 'ready' && hasAttachments ? handleSubmit($event) : undefined"
                @stop="chat.stop()"
                @reload="chat.regenerate()"
              />
            </div>
          </template>
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>

  <UContainer
    v-else
    class="flex-1 flex flex-col gap-4 sm:gap-6"
  >
    <UError
      :error="{ statusMessage: 'Chat not found', statusCode: 404 }"
      class="min-h-full"
    >
      <template #links>
        <UButton
          to="/"
          size="lg"
          label="Back to home"
        />
      </template>
    </UError>
  </UContainer>
</template>
