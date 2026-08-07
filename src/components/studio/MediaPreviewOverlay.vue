<script setup lang="ts">
import { computed } from 'vue'
import { useStudioTasks } from '../../composables/studio/useStudioTasks'

const tasks = useStudioTasks()
const { previewTask, previewUploadedImage, previewImageUrl, previewVideoUrl, previewRevisedPrompt } = tasks

const open = computed({
  get: () => Boolean(previewTask.value || previewUploadedImage.value),
  set: (value) => {
    if (!value) tasks.closePreview()
  }
})

const title = computed(() => {
  if (previewTask.value) return previewTask.value.kind === 'video' ? '视频预览' : '图片预览'
  return '源图预览'
})
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'glass-panel glass-panel--lg max-w-5xl overflow-hidden rounded-3xl p-0 divide-y-0' }"
  >
    <template #content>
      <div class="flex max-h-[calc(100vh-3rem)] flex-col">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <p class="text-sm font-semibold text-highlighted">
            {{ title }}
            <span
              v-if="previewTask"
              class="label-mono ml-2"
            >{{ previewTask.model }}</span>
          </p>
          <UButton
            type="button"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            class="glass-pill rounded-full"
            aria-label="关闭"
            @click="open = false"
          />
        </div>

        <div class="grid min-h-0 flex-1 place-items-center overflow-hidden bg-black/85 p-2">
          <video
            v-if="previewVideoUrl"
            :src="previewVideoUrl"
            controls
            autoplay
            loop
            playsinline
            class="max-h-[62vh] max-w-full rounded-xl"
          />
          <img
            v-else-if="previewImageUrl"
            :src="previewImageUrl"
            :alt="previewTask?.revisedPrompt || previewTask?.prompt || previewUploadedImage?.name || ''"
            class="max-h-[62vh] max-w-full rounded-xl object-contain"
          >
        </div>

        <div class="space-y-3 px-4 py-3">
          <p
            v-if="previewTask?.prompt"
            class="line-clamp-2 text-xs text-muted"
          >
            {{ previewTask.prompt }}
          </p>

          <div
            v-if="previewRevisedPrompt"
            class="rounded-xl border border-default bg-muted p-2.5"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <p class="label-mono">
                模型描述
              </p>
              <UButton
                type="button"
                icon="i-lucide-copy"
                color="neutral"
                variant="ghost"
                size="xs"
                class="glass-pill rounded-full"
                aria-label="复制模型描述"
                @click="tasks.copyRevisedPrompt(previewRevisedPrompt)"
              />
            </div>
            <p class="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted">
              {{ previewRevisedPrompt }}
            </p>
          </div>

          <div
            v-if="previewTask"
            class="flex flex-wrap justify-end gap-1.5"
          >
            <UButton
              v-if="previewTask.kind === 'image'"
              type="button"
              icon="i-lucide-paperclip"
              label="加入参考图"
              color="neutral"
              variant="outline"
              size="sm"
              class="glass-pill rounded-full"
              @click="tasks.addTaskImageAsReference(previewTask)"
            />
            <UButton
              v-if="previewTask.kind === 'image'"
              type="button"
              icon="i-lucide-copy"
              label="复制图片"
              color="neutral"
              variant="outline"
              size="sm"
              class="glass-pill rounded-full"
              @click="tasks.copyImage(previewTask)"
            />
            <UButton
              type="button"
              icon="i-lucide-text-cursor-input"
              label="复用提示词"
              color="neutral"
              variant="outline"
              size="sm"
              class="glass-pill rounded-full"
              @click="tasks.reusePrompt(previewTask); open = false"
            />
            <UButton
              type="button"
              icon="i-lucide-download"
              label="下载"
              color="primary"
              size="sm"
              class="glass-btn rounded-full"
              @click="tasks.downloadMediaTask(previewTask)"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
