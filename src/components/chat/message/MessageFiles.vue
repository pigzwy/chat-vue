<script setup lang="ts">
import type { FileUIPart } from 'ai'
import { formatFileSize, isImageMediaType } from '../../../utils/chatAttachments'

const props = defineProps<{
  files: FileUIPart[]
}>()

function fileLabel(file: FileUIPart) {
  return file.filename || file.mediaType || 'Attachment'
}

function dataUrlSize(url: string) {
  const payload = url.split(',')[1]
  if (!payload) return ''

  return formatFileSize(Math.floor((payload.length * 3) / 4))
}
</script>

<template>
  <div
    v-if="props.files.length"
    class="mb-3 flex flex-wrap gap-2"
  >
    <a
      v-for="(file, index) in props.files"
      :key="`${file.url}-${index}`"
      :href="file.url"
      :download="file.filename"
      target="_blank"
      rel="noopener noreferrer"
      class="overflow-hidden rounded-xl border border-default bg-elevated/50"
      :class="isImageMediaType(file.mediaType) ? 'block size-36' : 'flex max-w-72 items-center gap-3 px-3 py-2'"
    >
      <img
        v-if="isImageMediaType(file.mediaType)"
        :src="file.url"
        :alt="fileLabel(file)"
        class="size-full object-cover"
      >
      <template v-else>
        <UIcon
          name="i-lucide-file-text"
          class="size-5 shrink-0 text-muted"
        />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium text-highlighted">{{ fileLabel(file) }}</span>
          <span class="block text-xs text-muted">{{ file.mediaType }}{{ dataUrlSize(file.url) ? ` · ${dataUrlSize(file.url)}` : '' }}</span>
        </span>
      </template>
    </a>
  </div>
</template>
