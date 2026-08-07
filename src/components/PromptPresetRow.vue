<script setup lang="ts">
import type { PromptPreset } from '../data/promptPresets'

withDefaults(defineProps<{
  presets: PromptPreset[]
  disabled?: boolean
  align?: 'start' | 'center'
}>(), {
  disabled: false,
  align: 'start'
})

const emit = defineEmits<{
  select: [prompt: string]
}>()
</script>

<template>
  <div
    class="flex w-full flex-wrap gap-2"
    :class="align === 'center' ? 'justify-center' : undefined"
  >
    <button
      v-for="preset in presets"
      :key="preset.label"
      type="button"
      class="glass-pill inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="disabled"
      @click="emit('select', preset.prompt)"
    >
      <UIcon
        :name="preset.icon"
        class="size-3.5"
        :class="preset.color"
      />
      <span class="whitespace-nowrap">
        {{ preset.label }}
      </span>
    </button>
  </div>
</template>
