<script setup lang="ts">
import { computed } from 'vue'
import { useMediaModels } from '../../composables/studio/useMediaModels'

const {
  activeModel,
  activeModelLabel,
  activeModelOptions,
  activeGroupId,
  loadingModels,
  groupForModel,
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
      class="glass-pill max-w-44 shrink-0 rounded-full font-medium"
      :ui="{ label: 'truncate' }"
    />

    <template #content>
      <div class="glass-panel w-72 p-3">
        <p class="label-mono mb-1.5 flex items-center gap-1.5">
          模型
          <UIcon
            v-if="loadingModels"
            name="i-lucide-loader-circle"
            class="size-3 animate-spin"
          />
        </p>
        <div class="flex max-h-64 flex-col gap-1 overflow-y-auto">
          <UButton
            v-for="item in activeModelOptions"
            :key="item.value"
            type="button"
            :icon="item.icon"
            :label="item.label"
            color="neutral"
            :variant="activeModel === item.value ? 'soft' : 'ghost'"
            block
            class="justify-start rounded-xl font-medium"
            @click="selectModel(item.value)"
          >
            <template #trailing>
              <span class="label-mono ms-auto text-[10px]">
                组 {{ groupForModel(item.value) }}
              </span>
            </template>
          </UButton>
        </div>

        <p class="label-mono mt-3">
          当前分组 {{ activeGroupId }} · key 自动创建
        </p>
      </div>
    </template>
  </UPopover>
</template>
