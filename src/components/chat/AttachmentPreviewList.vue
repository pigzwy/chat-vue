<script setup lang="ts">
import { formatFileSize, isImageMediaType } from '../../utils/chatAttachments'
import type { ChatAttachment } from '../../composables/useChatAttachments'

defineProps<{
  attachments: ChatAttachment[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()
</script>

<template>
  <div class="flex gap-2 overflow-x-auto p-2">
    <div
      v-for="attachment in attachments"
      :key="attachment.id"
      class="pig-card group relative flex h-20 w-20 shrink-0 overflow-hidden rounded-2xl"
      :title="attachment.name"
    >
      <img
        v-if="attachment.previewUrl && isImageMediaType(attachment.mediaType)"
        :src="attachment.previewUrl"
        :alt="attachment.name"
        class="size-full object-cover"
      >
      <div
        v-else
        class="flex size-full flex-col items-center justify-center px-2 text-center"
      >
        <UIcon
          name="i-lucide-file-text"
          class="size-5 text-muted"
        />
        <span class="mt-1 max-w-full truncate text-[11px] font-medium text-highlighted">{{ attachment.name }}</span>
        <span class="text-[10px] text-muted">{{ formatFileSize(attachment.size) }}</span>
      </div>

      <UButton
        type="button"
        icon="i-lucide-x"
        color="neutral"
        variant="solid"
        size="xs"
        class="absolute right-1 top-1 rounded-full opacity-0 transition group-hover:opacity-100"
        aria-label="Remove attachment"
        :disabled="disabled"
        @click="emit('remove', attachment.id)"
      />
    </div>
  </div>
</template>
