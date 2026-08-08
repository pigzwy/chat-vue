<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resolveMediaModelSpec } from '../../../shared/utils/mediaModels'
import { useMediaModels } from '../../composables/studio/useMediaModels'
import { promptLimit, useStudioTasks } from '../../composables/studio/useStudioTasks'
import ModeTabs from './ModeTabs.vue'
import MediaModelMenu from './MediaModelMenu.vue'
import RatioResolutionPopover from './RatioResolutionPopover.vue'
import QualityPopover from './QualityPopover.vue'

const tasks = useStudioTasks()
const mediaModels = useMediaModels()
const {
  prompt,
  ratio,
  resolution,
  quality,
  videoDuration,
  videoResolution,
  files,
  canSubmit,
  currentUploadLimit,
  imageSize,
  estimatedCost,
  submitLabel,
  promptPlaceholder,
  isVideoMode,
  selectedTask
} = tasks

const fileInput = ref<HTMLInputElement | null>(null)
const durationOptions = [5, 10, 15]
const videoResolutionOptions = ['480p', '720p'] as const

const costText = computed(() => {
  if (estimatedCost.value == null) return ''
  return `$${(+estimatedCost.value).toFixed(3).replace(/\.?0+$/, '')}`
})

const imageSpec = computed(() => resolveMediaModelSpec(mediaModels.imageModel.value))

// 切到比例集合更小的模型（grok）时，把越界的已选比例回退到 Auto，避免上游 422
watch(imageSpec, (spec) => {
  const allowed = spec.supportedAspectRatios
  if (allowed && ratio.value !== 'Auto' && !allowed.includes(ratio.value)) {
    ratio.value = 'Auto'
  }
}, { immediate: true })

const showEditingChip = computed(() => Boolean(selectedTask.value) && !files.value.length)
const uploadDisabled = computed(() => files.value.length >= currentUploadLimit.value)

function pickFiles() {
  fileInput.value?.click()
}

function onFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  tasks.appendUploadedImages(Array.from(input.files || []).filter(file => file.type.startsWith('image/')))
  input.value = ''
}

function onSubmit() {
  if (!canSubmit.value) return
  void tasks.submitStudioTask()
}

function onPromptKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    onSubmit()
  }
}
</script>

<template>
  <div class="glass-input p-3">
    <div
      v-if="showEditingChip"
      class="mb-2 flex items-center gap-2"
    >
      <button
        type="button"
        class="glass-pill is-selected inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold"
        @click="selectedTask && tasks.previewMediaTask(selectedTask)"
      >
        <img
          v-if="selectedTask?.imageUrl"
          :src="selectedTask.imageUrl"
          alt=""
          class="size-5 rounded-md object-cover"
        >
        正在编辑 {{ tasks.getTaskNumber(selectedTask) }}
      </button>
      <UButton
        type="button"
        icon="i-lucide-history"
        color="neutral"
        variant="ghost"
        size="xs"
        class="glass-pill rounded-full"
        label="编辑历史"
        @click="tasks.historyPanelOpen.value = true"
      />
      <UButton
        type="button"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        class="glass-pill rounded-full"
        aria-label="取消编辑"
        @click="tasks.clearSelectedTask()"
      />
    </div>

    <div
      v-if="files.length"
      class="mb-2 flex gap-2 overflow-x-auto"
    >
      <div
        v-for="file in files"
        :key="file.id"
        class="group relative size-14 shrink-0 overflow-hidden rounded-xl border border-default"
      >
        <button
          type="button"
          class="block size-full"
          @click="tasks.previewUploadedSource(file)"
        >
          <img
            :src="file.previewUrl"
            :alt="file.name"
            class="size-full object-cover"
          >
        </button>
        <UButton
          type="button"
          icon="i-lucide-x"
          color="neutral"
          variant="solid"
          size="xs"
          class="absolute right-0.5 top-0.5 rounded-full opacity-0 transition group-hover:opacity-100"
          aria-label="移除源图"
          @click="tasks.removeUploadedImage(file.id)"
        />
      </div>
    </div>

    <UTextarea
      v-model="prompt"
      :rows="2"
      autoresize
      :maxrows="6"
      :maxlength="promptLimit"
      variant="none"
      :placeholder="promptPlaceholder"
      class="w-full"
      :ui="{ base: 'p-1 text-base' }"
      @paste="tasks.onPasteImages"
      @keydown="onPromptKeydown"
    />

    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-2.5">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <ModeTabs v-model="mediaModels.mediaMode.value" />

        <MediaModelMenu />

        <template v-if="!isVideoMode">
          <RatioResolutionPopover
            v-model:ratio="ratio"
            v-model:resolution="resolution"
            :size="imageSize"
            :show-resolution="imageSpec.supportsSizeQuality"
            :allowed-ratios="imageSpec.supportedAspectRatios"
          />
          <QualityPopover
            v-if="imageSpec.supportsSizeQuality"
            v-model="quality"
          />
        </template>

        <template v-else>
          <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-0.5">
            <button
              v-for="option in durationOptions"
              :key="option"
              type="button"
              class="glass-pill h-7 rounded-full px-2.5 text-xs font-semibold"
              :data-selected="videoDuration === option"
              @click="videoDuration = option"
            >
              {{ option }}s
            </button>
          </div>
          <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-0.5">
            <button
              v-for="option in videoResolutionOptions"
              :key="option"
              type="button"
              class="glass-pill h-7 rounded-full px-2.5 text-xs font-semibold"
              :data-selected="videoResolution === option"
              @click="videoResolution = option"
            >
              {{ option }}
            </button>
          </div>
        </template>

        <input
          ref="fileInput"
          type="file"
          :multiple="!isVideoMode"
          accept="image/png,image/jpeg,image/webp"
          class="hidden"
          @change="onFilesChange"
        >
        <UTooltip :text="isVideoMode ? '上传源图（图生视频）' : '上传参考图（以图生图）'">
          <UButton
            type="button"
            icon="i-lucide-image-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            class="glass-pill shrink-0 rounded-full"
            :label="files.length ? `${files.length}/${currentUploadLimit}` : undefined"
            :disabled="uploadDisabled"
            aria-label="上传图片"
            @click="pickFiles"
          />
        </UTooltip>

        <span
          v-if="costText"
          class="label-mono inline-flex shrink-0 items-center gap-1"
        >
          <UIcon
            name="i-lucide-coins"
            class="size-3"
          />
          ≈ {{ costText }}
        </span>
      </div>

      <UTooltip :text="`${submitLabel}（Ctrl+Enter）`">
        <UButton
          type="button"
          icon="i-lucide-arrow-up"
          color="primary"
          size="sm"
          class="glass-btn shrink-0"
          :disabled="!canSubmit"
          :aria-label="submitLabel"
          @click="onSubmit"
        />
      </UTooltip>
    </div>
  </div>
</template>
