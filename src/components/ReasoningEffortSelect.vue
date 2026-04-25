<script setup lang="ts">
import { computed } from 'vue'
import { useModels } from '../composables/useModels'
import { getReasoningEffortLabel, reasoningEffortItems } from '../../shared/utils/reasoning'

const { reasoningEffort } = useModels()

const activeIcon = computed(() => reasoningEffortItems.find(item => item.value === reasoningEffort.value)?.icon || 'i-lucide-sparkles')
</script>

<template>
  <UPopover>
    <UButton
      type="button"
      :icon="activeIcon"
      color="neutral"
      variant="soft"
      size="sm"
      :label="`思考: ${getReasoningEffortLabel(reasoningEffort)}`"
      class="shrink-0 rounded-full border border-[#1B3A6B]/15 bg-white/60 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10"
    />

    <template #content>
      <div class="w-40 p-1">
        <UButton
          v-for="item in reasoningEffortItems"
          :key="item.value"
          type="button"
          :icon="item.icon"
          :label="item.label"
          color="neutral"
          :variant="reasoningEffort === item.value ? 'soft' : 'ghost'"
          block
          class="justify-start rounded-lg"
          @click="reasoningEffort = item.value"
        />
      </div>
    </template>
  </UPopover>
</template>
