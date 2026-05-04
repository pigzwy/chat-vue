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
      class="warm-pill shrink-0 rounded-full font-medium"
    />

    <template #content>
      <div class="hero-panel w-44 rounded-2xl p-1.5">
        <UButton
          v-for="item in reasoningEffortItems"
          :key="item.value"
          type="button"
          :icon="item.icon"
          :label="item.label"
          color="neutral"
          :variant="reasoningEffort === item.value ? 'soft' : 'ghost'"
          block
          class="justify-start rounded-xl font-medium"
          @click="reasoningEffort = item.value"
        />
      </div>
    </template>
  </UPopover>
</template>
