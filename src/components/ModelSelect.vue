<script setup lang="ts">
import { useModels } from '../composables/useModels'

const { error, group, groups, loading, model, models, selectGroup } = useModels()

function onGroupChange(value?: number) {
  if (!value) return
  selectGroup(value)
}
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2">
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
      color="neutral"
      variant="soft"
      value-key="value"
      class="max-w-40 shrink-0 rounded-full border border-[#1B3A6B]/15 bg-white/60 shadow-sm backdrop-blur data-[state=open]:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:data-[state=open]:bg-white/15"
      :ui="{
        base: 'rounded-full',
        label: 'truncate',
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
      @update:model-value="onGroupChange"
    />

    <div
      v-if="groups.length"
      class="hidden h-6 w-px shrink-0 bg-default sm:block"
    />

    <USelectMenu
      v-model="model"
      :items="models"
      size="sm"
      :icon="models.find(m => m.value === model)?.icon"
      color="neutral"
      variant="soft"
      value-key="value"
      class="max-w-44 shrink-0 rounded-full border border-[#1B3A6B]/15 bg-white/60 shadow-sm backdrop-blur data-[state=open]:bg-white/80 sm:max-w-48 dark:border-white/10 dark:bg-white/10 dark:data-[state=open]:bg-white/15"
      :ui="{
        base: 'rounded-full',
        label: 'truncate',
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
    />
  </div>
</template>
