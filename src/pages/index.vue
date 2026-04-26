<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UIMessage } from 'ai'
import { useRouter } from 'vue-router'
import { useChats } from '../composables/useChats'
import { useChatAttachments } from '../composables/useChatAttachments'
import { useModels } from '../composables/useModels'
import { chatAttachmentAccept, chatAttachmentLimit } from '../utils/chatAttachments'
import ChatAttachmentPreviewList from '../components/chat/AttachmentPreviewList.vue'
import Navbar from '../components/Navbar.vue'
import ReasoningEffortSelect from '../components/ReasoningEffortSelect.vue'

const { fetchChats, createChat: createLocalChat } = useChats()
const { model } = useModels()
const toast = useToast()
const input = ref('')
const loading = ref(false)
const attachmentInput = ref<HTMLInputElement | null>(null)
const attachmentPending = ref(false)
const router = useRouter()
const {
  attachments,
  hasAttachments,
  addFiles,
  removeAttachment,
  clearAttachments,
  validateAttachments,
  toMessageParts
} = useChatAttachments()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const canSubmitChat = computed(() => input.value.trim().length > 0 || hasAttachments.value)

function buildInitialParts(text: string, attachmentParts: UIMessage['parts']): UIMessage['parts'] | undefined {
  if (!attachmentParts.length) return undefined

  return [
    ...(text ? [{ type: 'text' as const, text }] : []),
    ...attachmentParts
  ]
}

function pickAttachmentFiles() {
  if (loading.value || attachmentPending.value) return
  attachmentInput.value?.click()
}

function onAttachmentFilesChange(event: Event) {
  const target = event.target as HTMLInputElement
  addFiles(Array.from(target.files || []), model.value)
  target.value = ''
}

async function createChat(prompt: string, includeAttachments = false) {
  const text = prompt.trim()
  if (!text && (!includeAttachments || !hasAttachments.value)) return

  input.value = text
  loading.value = true
  attachmentPending.value = true

  try {
    if (includeAttachments && !validateAttachments(model.value)) {
      loading.value = false
      return
    }

    const attachmentParts = includeAttachments ? await toMessageParts() : []
    const chat = createLocalChat(text, buildInitialParts(text, attachmentParts))

    if (includeAttachments) {
      clearAttachments()
    }
    await fetchChats()
    router.push(`/chat/${chat?.id}`)
  } catch (error) {
    loading.value = false
    toast.add({
      description: error instanceof Error ? error.message : 'Failed to create chat',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  } finally {
    attachmentPending.value = false
  }
}

function onSubmit(event?: Event) {
  event?.preventDefault()
  createChat(input.value, true)
}

function useQuickChatPrompt(prompt: string) {
  if (loading.value) return
  input.value = prompt
}

const quickChats = [
  { label: '帮我总结这份资料', icon: 'i-lucide-file-text', color: 'text-blue-500' },
  { label: '写一份产品方案', icon: 'i-lucide-clipboard-list', color: 'text-amber-500' },
  { label: '优化这段提示词', icon: 'i-lucide-sparkles', color: 'text-violet-500' },
  { label: '生成一周学习计划', icon: 'i-lucide-calendar-check', color: 'text-emerald-500' },
  { label: '帮我分析图片内容', icon: 'i-lucide-image', color: 'text-pink-500' },
  { label: '写一封商务邮件', icon: 'i-lucide-mail', color: 'text-blue-500' },
  { label: '整理成表格对比', icon: 'i-lucide-table', color: 'text-amber-500' },
  { label: '把内容翻译成英文', icon: 'i-lucide-languages', color: 'text-violet-500' },
  { label: '生成会议纪要', icon: 'i-lucide-notebook-pen', color: 'text-emerald-500' },
  { label: '提炼行动清单', icon: 'i-lucide-check-square', color: 'text-pink-500' }
]
</script>

<template>
  <UDashboardPanel
    id="home"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar />
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center gap-6 py-8 sm:py-12">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-highlighted sm:text-3xl">
            {{ greeting }}
          </h1>
          <p class="mt-2 text-sm text-muted">
            有什么可以帮你的？
          </p>
        </div>

        <UChatPrompt
          v-model="input"
          :status="loading ? 'streaming' : 'ready'"
          class="warm-input mx-auto w-full max-w-3xl [view-transition-name:chat-prompt]"
          variant="subtle"
          :ui="{ base: 'px-3 py-2', footer: 'flex flex-wrap items-center justify-between gap-3 pt-3 warm-divider border-t' }"
          @submit="onSubmit"
        >
          <template
            v-if="attachments.length"
            #header
          >
            <ChatAttachmentPreviewList
              :attachments="attachments"
              :disabled="loading || attachmentPending"
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
                  :disabled="loading || attachmentPending || attachments.length >= chatAttachmentLimit"
                  aria-label="Add attachments"
                  @click="pickAttachmentFiles"
                />
              </UTooltip>
            </div>

            <div class="flex shrink-0 items-center">
              <UChatPromptSubmit
                icon="i-lucide-arrow-up"
                color="primary"
                size="sm"
                class="warm-btn shrink-0"
                :type="hasAttachments ? 'button' : undefined"
                :disabled="attachmentPending || !canSubmitChat"
                @click="hasAttachments ? onSubmit($event) : undefined"
              />
            </div>
          </template>
        </UChatPrompt>

        <div class="mx-auto flex w-full max-w-3xl flex-wrap justify-center gap-2">
          <button
            v-for="quickChat in quickChats"
            :key="quickChat.label"
            type="button"
            class="warm-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
            @click="useQuickChatPrompt(quickChat.label)"
          >
            <UIcon
              :name="quickChat.icon"
              class="size-3.5"
              :class="quickChat.color"
            />
            <span class="whitespace-nowrap">
              {{ quickChat.label }}
            </span>
          </button>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
