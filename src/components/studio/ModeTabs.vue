<script setup lang="ts">
import type { MediaKind } from '../../../shared/utils/mediaModels'

const mode = defineModel<MediaKind>({ required: true })

const tabs: Array<{ value: MediaKind, label: string, icon: string }> = [
  { value: 'image', label: '图片', icon: 'i-lucide-image' },
  { value: 'video', label: '视频', icon: 'i-lucide-clapperboard' }
]
</script>

<template>
  <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-0.5">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="glass-pill inline-flex h-7 items-center gap-1 px-2.5 text-xs font-semibold"
      :data-selected="mode === tab.value"
      @click="mode = tab.value"
    >
      <UIcon
        :name="tab.icon"
        class="size-3.5"
      />
      {{ tab.label }}
    </button>
  </div>
</template>
