<script setup lang="ts">
import { computed } from 'vue'
import { useMediaModels } from '../../composables/studio/useMediaModels'

const {
  activeModel,
  activeModelLabel,
  activeModelOptions,
  loadingModels,
  selectModel
} = useMediaModels()

const activeIcon = computed(() => {
  return activeModelOptions.value.find(item => item.value === activeModel.value)?.icon || 'i-lucide-box'
})
</script>

<template>
  <UPopover>
    <UButton
      type="button"
      color="neutral"
      variant="ghost"
      size="sm"
      :icon="activeIcon"
      :label="activeModelLabel"
      trailing-icon="i-lucide-chevron-up"
      class="glass-pill max-w-48 shrink-0 rounded-full font-medium"
      :ui="{ label: 'truncate' }"
    />

    <template #content>
      <div class="glass-panel w-80 p-2">
        <p class="label-mono mb-1.5 flex items-center gap-1.5 px-1.5 pt-1">
          选择模型
          <UIcon
            v-if="loadingModels"
            name="i-lucide-loader-circle"
            class="size-3 animate-spin"
          />
        </p>
        <div class="flex max-h-80 flex-col gap-1 overflow-y-auto">
          <button
            v-for="item in activeModelOptions"
            :key="item.value"
            type="button"
            class="glass-pill flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left"
            :data-selected="activeModel === item.value"
            @click="selectModel(item.value)"
          >
            <UIcon
              :name="item.icon"
              class="mt-0.5 size-4 shrink-0"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-semibold">{{ item.label }}</span>
                <span
                  v-if="item.price"
                  class="label-mono shrink-0 text-[10px]"
                >{{ item.price }}</span>
              </span>
              <span
                v-if="item.description"
                class="mt-0.5 block text-xs leading-4 opacity-70"
              >{{ item.description }}</span>
            </span>
            <UIcon
              v-if="activeModel === item.value"
              name="i-lucide-check"
              class="mt-0.5 size-4 shrink-0"
            />
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
