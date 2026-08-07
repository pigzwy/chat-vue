<script setup lang="ts">
import { useStudioTasks } from '../../composables/studio/useStudioTasks'

const tasks = useStudioTasks()
const { batchMode, selectedBatchTasks, downloadableTasks } = tasks
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <template v-if="batchMode">
      <span class="label-mono mr-1">
        已选 {{ selectedBatchTasks.length }} / {{ downloadableTasks.length }}
      </span>
      <UButton
        type="button"
        icon="i-lucide-check-check"
        label="全选"
        color="neutral"
        variant="ghost"
        size="xs"
        class="glass-pill rounded-full"
        @click="tasks.selectAllBatchTasks()"
      />
      <UButton
        type="button"
        icon="i-lucide-download"
        label="下载"
        color="neutral"
        variant="ghost"
        size="xs"
        class="glass-pill rounded-full"
        :disabled="!selectedBatchTasks.length"
        @click="tasks.downloadSelectedTasks()"
      />
      <UButton
        type="button"
        icon="i-lucide-trash"
        label="删除"
        color="error"
        variant="ghost"
        size="xs"
        class="glass-pill rounded-full"
        :disabled="!selectedBatchTasks.length"
        @click="tasks.deleteSelectedTasks()"
      />
      <UButton
        type="button"
        icon="i-lucide-x"
        label="取消"
        color="neutral"
        variant="ghost"
        size="xs"
        class="glass-pill rounded-full"
        @click="tasks.toggleBatchMode()"
      />
    </template>
    <UButton
      v-else
      type="button"
      icon="i-lucide-square-check"
      label="批量管理"
      color="neutral"
      variant="ghost"
      size="xs"
      class="glass-pill rounded-full"
      :disabled="!downloadableTasks.length"
      @click="tasks.toggleBatchMode()"
    />
  </div>
</template>
