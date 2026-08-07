<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UIMessage } from 'ai'
import { useRouter } from 'vue-router'
import { useChats } from '../composables/useChats'
import { useChatAttachments } from '../composables/useChatAttachments'
import { useModels } from '../composables/useModels'
import ChatComposer from '../components/chat/ChatComposer.vue'
import Navbar from '../components/Navbar.vue'
import PromptPresetRow from '../components/PromptPresetRow.vue'
import { homeQuickPrompts } from '../data/promptPresets'

const { fetchChats, createChat: createLocalChat } = useChats()
const { model } = useModels()
const toast = useToast()
const input = ref('')
const loading = ref(false)
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

function onAttachmentFiles(files: File[]) {
  addFiles(files, model.value)
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
      description: error instanceof Error ? error.message : '创建对话失败',
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
      <UContainer class="relative flex-1 flex flex-col justify-center gap-7 py-10 sm:py-14">
        <div class="pointer-events-none absolute left-1/2 top-16 size-52 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div class="relative mx-auto max-w-2xl text-center">
          <div class="glass-orb mx-auto mb-5 flex size-14 items-center justify-center rounded-3xl text-white">
            <UIcon
              name="i-lucide-sparkles"
              class="size-6"
            />
          </div>
          <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-5xl">
            {{ greeting }}
          </h1>
          <p class="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted sm:text-base">
            输入问题、上传资料，或从下方选择一个常用场景开始。
          </p>
        </div>

        <ChatComposer
          v-model="input"
          class="mx-auto w-full max-w-3xl animate-fade-scale"
          large
          :attachments="attachments"
          :attachment-pending="attachmentPending || loading"
          :can-submit="canSubmitChat && !loading"
          @submit="onSubmit"
          @files="onAttachmentFiles"
          @remove-attachment="removeAttachment"
        />

        <PromptPresetRow
          class="mx-auto max-w-3xl"
          :presets="homeQuickPrompts"
          :disabled="loading"
          align="center"
          @select="useQuickChatPrompt"
        />
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
