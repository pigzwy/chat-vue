<script setup lang="ts">
import { ref, computed } from 'vue'
import type { UIMessage } from 'ai'
import { useRouter } from 'vue-router'
import { $fetch } from 'ofetch'
import { useChats } from '../composables/useChats'
import { useCsrf } from '../composables/useCsrf'
import { useChatAttachments } from '../composables/useChatAttachments'
import { useModels } from '../composables/useModels'
import { chatAttachmentAccept, chatAttachmentLimit } from '../utils/chatAttachments'
import ChatAttachmentPreviewList from '../components/chat/AttachmentPreviewList.vue'
import Navbar from '../components/Navbar.vue'
import ReasoningEffortSelect from '../components/ReasoningEffortSelect.vue'

const { fetchChats } = useChats()
const { csrf, headerName } = useCsrf()
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
  let timeGreeting = 'Good evening'
  if (hour < 12) timeGreeting = 'Good morning'
  else if (hour < 18) timeGreeting = 'Good afternoon'

  return timeGreeting
})

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
    const chat = await $fetch('/api/chats', {
      method: 'POST',
      headers: { [headerName]: csrf() },
      body: {
        input: text,
        parts: buildInitialParts(text, attachmentParts)
      }
    })

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

const quickChats = [
  {
    label: 'Why use Nuxt UI?',
    icon: 'i-logos-nuxt-icon'
  },
  {
    label: 'Help me create a Vue composable',
    icon: 'i-logos-vue'
  },
  {
    label: 'Tell me more about UnJS',
    icon: 'i-logos-unjs'
  },
  {
    label: 'Why should I consider VueUse?',
    icon: 'i-logos-vueuse'
  },
  {
    label: 'Tailwind CSS best practices',
    icon: 'i-logos-tailwindcss-icon'
  },
  {
    label: 'What is the weather in Bordeaux?',
    icon: 'i-lucide-sun'
  },
  {
    label: 'Show me a chart of sales data',
    icon: 'i-lucide-line-chart'
  }
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
      <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8">
        <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
          {{ greeting }}
        </h1>

        <UChatPrompt
          v-model="input"
          :status="loading ? 'streaming' : 'ready'"
          class="[view-transition-name:chat-prompt]"
          variant="subtle"
          :ui="{ base: 'px-1.5', footer: 'flex flex-wrap items-center justify-between gap-3 border-t border-default pt-2' }"
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
                color="neutral"
                size="sm"
                class="shrink-0 rounded-full"
                :type="hasAttachments ? 'button' : undefined"
                :disabled="attachmentPending"
                @click="hasAttachments ? onSubmit($event) : undefined"
              />
            </div>
          </template>
        </UChatPrompt>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="quickChat in quickChats"
            :key="quickChat.label"
            :icon="quickChat.icon"
            :label="quickChat.label"
            size="sm"
            color="neutral"
            variant="outline"
            class="rounded-full"
            @click="createChat(quickChat.label, false)"
          />
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
