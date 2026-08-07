<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useStudioTasks, type MediaTask } from '../../composables/studio/useStudioTasks'

const props = defineProps<{
  task: MediaTask
}>()

const tasks = useStudioTasks()
const { batchMode, selectedTaskId, selectedBatchIds } = tasks

// 视频代理地址随任务过期（2h/服务重启）失效，加载失败时给出明确状态
const videoFailed = ref(false)

const hasMedia = computed(() => Boolean(props.task.imageUrl || props.task.videoUrl))
const isVideo = computed(() => props.task.kind === 'video')
const isSelectedForEdit = computed(() => selectedTaskId.value === props.task.id)
const isBatchSelected = computed(() => selectedBatchIds.value.includes(props.task.id))

const metaText = computed(() => {
  const parts: string[] = [props.task.model]
  if (isVideo.value) {
    if (props.task.duration) parts.push(`${props.task.duration}s`)
    if (props.task.videoResolution) parts.push(props.task.videoResolution)
  } else {
    if (props.task.resolution) parts.push(props.task.resolution)
    if (props.task.ratio) parts.push(props.task.ratio)
  }
  return parts.join(' · ')
})

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const main: DropdownMenuItem[] = [
    {
      label: '预览',
      icon: 'i-lucide-eye',
      onSelect: () => tasks.previewMediaTask(props.task)
    },
    {
      label: '复用提示词',
      icon: 'i-lucide-text-cursor-input',
      onSelect: () => tasks.reusePrompt(props.task)
    }
  ]

  if (!isVideo.value) {
    main.splice(1, 0, {
      label: '设为当前编辑',
      icon: 'i-lucide-pencil',
      disabled: isSelectedForEdit.value,
      onSelect: () => tasks.setCurrentTask(props.task)
    }, {
      label: '加入参考图',
      icon: 'i-lucide-paperclip',
      onSelect: () => {
        void tasks.addTaskImageAsReference(props.task)
      }
    })
  }

  const share: DropdownMenuItem[] = []
  if (!isVideo.value) {
    share.push({
      label: '复制图片',
      icon: 'i-lucide-copy',
      onSelect: () => {
        void tasks.copyImage(props.task)
      }
    })
  }
  share.push({
    label: '下载',
    icon: 'i-lucide-download',
    onSelect: () => {
      void tasks.downloadMediaTask(props.task)
    }
  })

  return [main, share, [{
    label: '删除',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect: () => {
      void tasks.deleteMediaTask(props.task)
    }
  }]]
})

function onMediaClick() {
  if (!hasMedia.value) return
  if (batchMode.value) {
    tasks.toggleBatchTask(props.task)
    return
  }
  if (isVideo.value) {
    tasks.previewMediaTask(props.task)
    return
  }
  tasks.selectMediaTask(props.task)
}

function onVideoEnter(event: MouseEvent) {
  const video = event.currentTarget as HTMLVideoElement
  void video.play().catch(() => {})
}

function onVideoLeave(event: MouseEvent) {
  const video = event.currentTarget as HTMLVideoElement
  video.pause()
  video.currentTime = 0
}
</script>

<template>
  <article
    class="glass-card-hover group relative flex flex-col overflow-hidden rounded-2xl"
    :class="isSelectedForEdit ? 'ring-2 ring-primary' : ''"
  >
    <div class="relative aspect-square w-full overflow-hidden bg-muted">
      <template v-if="task.status === 'generating'">
        <div class="shimmer-block absolute inset-0" />
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <UIcon
            :name="isVideo ? 'i-lucide-clapperboard' : 'i-lucide-image'"
            class="size-6 text-muted"
          />
          <p class="label-mono">
            {{ isVideo ? '视频生成中' : '图片生成中' }} · {{ tasks.getTaskDurationSeconds(task) }}s
          </p>
          <p class="line-clamp-2 text-xs text-muted">
            {{ task.prompt }}
          </p>
        </div>
      </template>

      <template v-else-if="task.status === 'error'">
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
          <UIcon
            name="i-lucide-circle-alert"
            class="size-6 text-error"
          />
          <p class="line-clamp-3 text-xs text-muted">
            {{ task.error || '生成失败' }}
          </p>
          <div class="flex gap-1.5">
            <UButton
              type="button"
              icon="i-lucide-rotate-cw"
              label="重试"
              color="neutral"
              variant="soft"
              size="xs"
              class="glass-pill rounded-full"
              @click="tasks.retryMediaTask(task)"
            />
            <UButton
              type="button"
              icon="i-lucide-trash"
              color="neutral"
              variant="ghost"
              size="xs"
              class="glass-pill rounded-full"
              aria-label="删除"
              @click="tasks.deleteMediaTask(task)"
            />
          </div>
        </div>
      </template>

      <template v-else>
        <div
          v-if="isVideo && videoFailed"
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
        >
          <UIcon
            name="i-lucide-timer-off"
            class="size-6 text-muted"
          />
          <p class="text-xs text-muted">
            视频已过期，请重新生成
          </p>
          <UButton
            type="button"
            icon="i-lucide-rotate-cw"
            label="重新生成"
            color="neutral"
            variant="soft"
            size="xs"
            class="glass-pill rounded-full"
            @click="tasks.retryMediaTask(task)"
          />
        </div>

        <button
          v-else
          type="button"
          class="block size-full text-left"
          @click="onMediaClick"
        >
          <video
            v-if="isVideo && task.videoUrl"
            :src="task.videoUrl"
            preload="metadata"
            muted
            playsinline
            loop
            class="size-full object-cover"
            @mouseenter="onVideoEnter"
            @mouseleave="onVideoLeave"
            @error="videoFailed = true"
          />
          <img
            v-else-if="task.imageUrl"
            :src="task.imageUrl"
            :alt="task.revisedPrompt || task.prompt"
            loading="lazy"
            decoding="async"
            class="size-full object-cover transition duration-500 group-hover:scale-105"
          >
        </button>

        <div
          v-if="batchMode && hasMedia"
          class="absolute left-2 top-2"
        >
          <span
            class="flex size-6 items-center justify-center rounded-full border-2 transition"
            :class="isBatchSelected ? 'border-primary bg-primary text-white' : 'border-white/80 bg-black/30 text-transparent'"
          >
            <UIcon
              name="i-lucide-check"
              class="size-3.5"
            />
          </span>
        </div>

        <div
          v-else
          class="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
        >
          <UIcon
            :name="isVideo ? 'i-lucide-clapperboard' : 'i-lucide-image'"
            class="size-3"
          />
          {{ isVideo ? '视频' : '图片' }}
        </div>

        <div
          v-if="!batchMode"
          class="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100"
        >
          <UButton
            type="button"
            icon="i-lucide-eye"
            color="neutral"
            variant="solid"
            size="xs"
            class="rounded-full"
            aria-label="预览"
            @click.stop="tasks.previewMediaTask(task)"
          />
          <UDropdownMenu :items="menuItems">
            <UButton
              type="button"
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="solid"
              size="xs"
              class="rounded-full"
              aria-label="更多操作"
            />
          </UDropdownMenu>
        </div>

        <div
          v-if="isVideo && task.videoUrl"
          class="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-white backdrop-blur"
        >
          {{ task.duration || '' }}s
        </div>
      </template>
    </div>

    <div class="flex items-center justify-between gap-2 px-3 py-2">
      <div class="min-w-0">
        <p class="label-mono truncate">
          {{ metaText }}
        </p>
        <p class="mt-0.5 truncate text-[11px] text-dimmed">
          {{ tasks.formatTaskCreatedAt(task) }}
          <template v-if="task.durationSeconds">
            · 耗时 {{ task.durationSeconds }}s
          </template>
          <template v-if="task.costUsd">
            · ${{ task.costUsd.toFixed(3).replace(/\.?0+$/, '') }}
          </template>
        </p>
      </div>
      <UBadge
        :label="task.type === 'edit' ? (isVideo ? '图生视频' : '编辑') : '生成'"
        color="neutral"
        variant="subtle"
        size="sm"
        class="shrink-0 rounded-full"
      />
    </div>
  </article>
</template>
