<script setup lang="ts">
import { useModels } from '../composables/useModels'

const { error, group, groups, loading, model, models, selectGroup } = useModels()

function onGroupChange(value?: number) {
  if (!value) return
  selectGroup(value)
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <UIcon
      v-if="loading"
      name="i-lucide-loader-circle"
      class="size-4 shrink-0 animate-spin text-muted"
    />

    <UPopover v-else-if="error">
      <UIcon
        name="i-lucide-circle-alert"
        class="size-4 shrink-0 cursor-help text-error"
      />

      <template #content>
        <div class="max-w-80 p-2 text-sm text-error">
          {{ error }}
        </div>
      </template>
    </UPopover>

    <USelectMenu
      v-if="groups.length"
      :model-value="group ?? undefined"
      :items="groups"
      size="sm"
      :icon="groups.find(item => item.value === group)?.icon"
      variant="ghost"
      value-key="value"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
      @update:model-value="onGroupChange"
    />

    <USelectMenu
      v-model="model"
      :items="models"
      size="sm"
      :icon="models.find(m => m.value === model)?.icon"
      variant="ghost"
      value-key="value"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
    />
  </div>
</template>
