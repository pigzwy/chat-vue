<script setup lang="ts">
import { computed } from 'vue'
import { useModels } from '../composables/useModels'
import { reasoningEffortItems } from '../../shared/utils/reasoning'

const { error, group, groups, loading, model, models, reasoningEffort, selectGroup } = useModels()

const activeModel = computed(() => models.value.find(item => item.value === model.value))

function onGroupChange(value?: number) {
  if (value == null) return
  selectGroup(value)
}
</script>

<template>
  <UPopover>
    <UButton
      type="button"
      color="neutral"
      variant="ghost"
      size="sm"
      :icon="loading ? 'i-lucide-loader-circle' : (activeModel?.icon || 'i-lucide-sparkles')"
      :label="activeModel?.label || model"
      trailing-icon="i-lucide-chevron-down"
      class="glass-pill max-w-56 shrink-0 rounded-full font-medium"
      :ui="{ label: 'truncate', leadingIcon: loading ? 'animate-spin' : undefined }"
    />

    <template #content>
      <div class="glass-panel w-80 space-y-3 p-3">
        <div
          v-if="error"
          class="flex items-start gap-2 rounded-xl bg-error/10 px-2.5 py-2 text-xs text-error"
        >
          <UIcon
            name="i-lucide-circle-alert"
            class="mt-0.5 size-3.5 shrink-0"
          />
          {{ error }}
        </div>

        <div v-if="groups.length">
          <p class="label-mono mb-1.5">
            分组
          </p>
          <USelectMenu
            :model-value="group ?? undefined"
            :items="groups"
            size="sm"
            :icon="groups.find(item => item.value === group)?.icon"
            value-key="value"
            class="w-full"
            @update:model-value="onGroupChange"
          />
        </div>

        <div>
          <p class="label-mono mb-1.5">
            模型
          </p>
          <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            <button
              v-for="item in models"
              :key="item.value"
              type="button"
              class="glass-pill flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm font-medium"
              :data-selected="model === item.value"
              @click="model = item.value"
            >
              <UIcon
                :name="item.icon"
                class="size-4 shrink-0"
              />
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <UIcon
                v-if="model === item.value"
                name="i-lucide-check"
                class="size-4 shrink-0"
              />
            </button>
          </div>
        </div>

        <div>
          <p class="label-mono mb-1.5">
            思考强度
          </p>
          <div class="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
            <button
              v-for="item in reasoningEffortItems"
              :key="item.value"
              type="button"
              class="glass-pill h-7 flex-1 rounded-full text-xs font-semibold"
              :data-selected="reasoningEffort === item.value"
              @click="reasoningEffort = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
