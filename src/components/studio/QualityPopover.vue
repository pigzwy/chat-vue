<script setup lang="ts">
import { computed } from 'vue'
import { getImageQualityLabel, imageQualityItems, type ImageQuality } from '../../../shared/utils/images'

const quality = defineModel<ImageQuality>({ required: true })

const activeIcon = computed(() => {
  return imageQualityItems.find(item => item.value === quality.value)?.icon || 'i-lucide-gem'
})
</script>

<template>
  <UPopover>
    <UButton
      type="button"
      :icon="activeIcon"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="`质量: ${getImageQualityLabel(quality)}`"
      class="glass-pill shrink-0 rounded-full font-medium"
    />

    <template #content>
      <div class="glass-panel w-60 p-1.5">
        <button
          v-for="item in imageQualityItems"
          :key="item.value"
          type="button"
          class="glass-pill flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left"
          :data-selected="quality === item.value"
          @click="quality = item.value"
        >
          <UIcon
            :name="item.icon"
            class="mt-0.5 size-4 shrink-0"
          />
          <span class="min-w-0">
            <span class="block text-sm font-semibold">{{ item.label }}</span>
            <span class="block text-xs opacity-70">{{ item.description }}</span>
          </span>
        </button>
      </div>
    </template>
  </UPopover>
</template>
