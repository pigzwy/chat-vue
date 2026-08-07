<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatStatus } from 'ai'
import { chatAttachmentAccept, chatAttachmentLimit } from '../../utils/chatAttachments'
import type { ChatAttachment } from '../../composables/useChatAttachments'
import ChatAttachmentPreviewList from './AttachmentPreviewList.vue'
import ModelSelect from '../ModelSelect.vue'
import ReasoningEffortSelect from '../ReasoningEffortSelect.vue'

const props = withDefaults(defineProps<{
  status?: ChatStatus
  error?: Error
  attachments: ChatAttachment[]
  attachmentPending?: boolean
  canSubmit?: boolean
  large?: boolean
}>(), {
  status: 'ready',
  error: undefined,
  attachmentPending: false,
  canSubmit: false,
  large: false
})

const input = defineModel<string>({ default: '' })

const emit = defineEmits<{
  submit: [event?: Event]
  stop: []
  reload: []
  files: [files: File[]]
  removeAttachment: [id: string]
}>()

const attachmentInput = ref<HTMLInputElement | null>(null)
const isReady = computed(() => props.status === 'ready')
const hasAttachments = computed(() => props.attachments.length > 0)

function pickAttachmentFiles() {
  if (!isReady.value || props.attachmentPending) return
  attachmentInput.value?.click()
}

function onAttachmentFilesChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('files', Array.from(target.files || []))
  target.value = ''
}
</script>

<template>
  <UChatPrompt
    v-model="input"
    :error="error"
    variant="subtle"
    class="glass-input [view-transition-name:chat-prompt]"
    :ui="{
      base: large ? 'px-4 py-3 text-base' : 'px-4 py-3',
      footer: 'flex flex-wrap items-center justify-between gap-3 border-t border-default pt-3'
    }"
    @submit="emit('submit', $event)"
  >
    <template
      v-if="attachments.length"
      #header
    >
      <ChatAttachmentPreviewList
        :attachments="attachments"
        :disabled="!isReady || attachmentPending"
        @remove="emit('removeAttachment', $event)"
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
        <UTooltip text="添加附件">
          <UButton
            type="button"
            icon="i-lucide-paperclip"
            color="neutral"
            variant="ghost"
            size="sm"
            class="glass-pill shrink-0 rounded-full"
            :label="attachments.length ? `${attachments.length}/${chatAttachmentLimit}` : undefined"
            :disabled="!isReady || attachmentPending || attachments.length >= chatAttachmentLimit"
            aria-label="添加附件"
            @click="pickAttachmentFiles"
          />
        </UTooltip>
      </div>

      <div class="flex shrink-0 items-center">
        <UChatPromptSubmit
          :status="status"
          icon="i-lucide-arrow-up"
          color="primary"
          size="sm"
          class="glass-btn shrink-0"
          :type="hasAttachments ? 'button' : undefined"
          :disabled="isReady && (attachmentPending || !canSubmit)"
          @click="isReady && hasAttachments ? emit('submit', $event) : undefined"
          @stop="emit('stop')"
          @reload="emit('reload')"
        />
      </div>
    </template>
  </UChatPrompt>
</template>
