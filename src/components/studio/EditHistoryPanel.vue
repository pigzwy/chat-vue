<script setup lang="ts">
import { useStudioTasks } from '../../composables/studio/useStudioTasks'

const tasks = useStudioTasks()
const { historyPanelOpen, selectedHistory, selectedTaskId } = tasks
</script>

<template>
  <USlideover
    v-model:open="historyPanelOpen"
    title="编辑历史"
    description="从最初生成到当前选中图片的编辑链路"
    :ui="{ content: 'glass-panel glass-panel--lg m-3 rounded-3xl' }"
  >
    <template #body>
      <div
        v-if="selectedHistory.length"
        class="flex flex-col gap-3"
      >
        <div
          v-for="(item, index) in selectedHistory"
          :key="item.id"
          class="glass-panel overflow-hidden rounded-2xl"
          :class="item.id === selectedTaskId ? 'ring-2 ring-primary' : ''"
        >
          <button
            type="button"
            class="block w-full"
            @click="tasks.previewMediaTask(item)"
          >
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              :alt="item.prompt"
              class="aspect-video w-full object-cover"
            >
          </button>
          <div class="space-y-2 p-3">
            <p class="label-mono">
              第 {{ index + 1 }} 步 · {{ item.type === 'edit' ? '编辑' : '生成' }}
            </p>
            <p class="line-clamp-2 text-xs text-muted">
              {{ item.prompt }}
            </p>
            <div class="flex gap-1.5">
              <UButton
                type="button"
                icon="i-lucide-text-cursor-input"
                label="复用提示词"
                color="neutral"
                variant="ghost"
                size="xs"
                class="glass-pill rounded-full"
                @click="tasks.reusePrompt(item)"
              />
              <UButton
                type="button"
                icon="i-lucide-pencil"
                label="设为当前"
                color="neutral"
                variant="ghost"
                size="xs"
                class="glass-pill rounded-full"
                :disabled="item.id === selectedTaskId || !item.imageUrl"
                @click="tasks.setCurrentTask(item)"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="flex flex-col items-center gap-2 py-10 text-center"
      >
        <UIcon
          name="i-lucide-history"
          class="size-8 text-muted"
        />
        <p class="text-sm text-muted">
          先在结果里选中一张图片，这里会展示它的编辑链路。
        </p>
      </div>
    </template>
  </USlideover>
</template>
