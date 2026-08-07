<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useStudioTasks } from '../composables/studio/useStudioTasks'
import { imagePromptPresets, videoPromptPresets } from '../data/promptPresets'
import PromptPresetRow from '../components/PromptPresetRow.vue'
import ComposerBar from '../components/studio/ComposerBar.vue'
import MediaTaskGrid from '../components/studio/MediaTaskGrid.vue'
import TaskBatchToolbar from '../components/studio/TaskBatchToolbar.vue'
import MediaPreviewOverlay from '../components/studio/MediaPreviewOverlay.vue'
import EditHistoryPanel from '../components/studio/EditHistoryPanel.vue'

const tasks = useStudioTasks()
const { queue, imageTasks, videoTasks, prompt, files, isDraggingImages, isVideoMode } = tasks

const presets = computed(() => isVideoMode.value ? videoPromptPresets : imagePromptPresets)
const showPresets = computed(() => !prompt.value.trim() && !files.value.length)

const statsText = computed(() => {
  const parts: string[] = []
  if (imageTasks.value.length) parts.push(`${imageTasks.value.length} 张图片`)
  if (videoTasks.value.length) parts.push(`${videoTasks.value.length} 个视频`)
  return parts.join(' · ') || '还没有生成记录'
})

function usePreset(presetPrompt: string) {
  const current = prompt.value.trim()
  prompt.value = current ? `${current}，${presetPrompt}` : presetPrompt
}

onMounted(() => {
  tasks.init()
})

onBeforeUnmount(() => {
  tasks.dispose()
})
</script>

<template>
  <div
    class="aurora-shell relative flex min-h-0 flex-1 flex-col overflow-hidden"
    @dragover="tasks.onDragOverImages"
    @dragleave="tasks.onDragLeaveImages"
    @drop="tasks.onDropImages"
  >
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-72 sm:px-6">
      <div class="mx-auto w-full max-w-7xl">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-highlighted">
              创作台
            </h1>
            <p class="label-mono mt-1">
              {{ statsText }}
            </p>
          </div>
          <TaskBatchToolbar />
        </div>

        <MediaTaskGrid
          v-if="queue.length"
          :tasks="queue"
        />

        <div
          v-else
          class="flex flex-col items-center justify-center gap-4 py-24 text-center"
        >
          <div class="glass-orb flex size-14 items-center justify-center rounded-3xl text-white">
            <UIcon
              :name="isVideoMode ? 'i-lucide-clapperboard' : 'i-lucide-wand-sparkles'"
              class="size-6"
            />
          </div>
          <div>
            <h2 class="text-lg font-bold text-highlighted">
              {{ isVideoMode ? '生成你的第一个视频' : '生成你的第一张图片' }}
            </h2>
            <p class="mx-auto mt-1.5 max-w-md text-sm text-muted">
              {{ isVideoMode
                ? '在下方描述画面与镜头，或上传一张图片让它动起来。'
                : '在下方描述你想要的画面，也可以上传参考图以图生图。' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-6">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <PromptPresetRow
          v-if="showPresets"
          class="pointer-events-auto"
          :presets="presets"
          @select="usePreset"
        />
        <ComposerBar class="pointer-events-auto" />
      </div>
    </div>

    <div
      v-if="isDraggingImages"
      class="pointer-events-none absolute inset-0 z-20 m-3 grid place-items-center rounded-3xl border-2 border-dashed border-primary bg-primary/5"
    >
      <div class="glass-panel flex items-center gap-2 px-4 py-2.5">
        <UIcon
          name="i-lucide-image-plus"
          class="size-5 text-primary"
        />
        <span class="text-sm font-semibold text-highlighted">松开鼠标，把图片作为{{ isVideoMode ? '视频源图' : '编辑参考图' }}</span>
      </div>
    </div>

    <MediaPreviewOverlay />
    <EditHistoryPanel />
  </div>
</template>
