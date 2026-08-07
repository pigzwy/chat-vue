<script setup lang="ts">
import { imageResolutions, type ImageRatio, type ImageResolution } from '../../../shared/utils/images'

const ratio = defineModel<ImageRatio>('ratio', { required: true })
const resolution = defineModel<ImageResolution>('resolution', { required: true })

defineProps<{
  size: string
}>()

const ratioOptions: Array<{ value: ImageRatio, aspect: string, auto?: boolean }> = [
  { value: '1:1', aspect: '1 / 1' },
  { value: '3:2', aspect: '3 / 2' },
  { value: '16:9', aspect: '16 / 9' },
  { value: '21:9', aspect: '21 / 9' },
  { value: '9:16', aspect: '9 / 16' },
  { value: '4:3', aspect: '4 / 3' },
  { value: '3:4', aspect: '3 / 4' },
  { value: 'Auto', aspect: '1 / 1', auto: true }
]
</script>

<template>
  <UPopover>
    <UButton
      type="button"
      icon="i-lucide-proportions"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="`${ratio} · ${resolution}`"
      class="glass-pill shrink-0 rounded-full font-medium"
    />

    <template #content>
      <div class="glass-panel w-72 p-3">
        <p class="label-mono mb-2">
          画面比例
        </p>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="option in ratioOptions"
            :key="option.value"
            type="button"
            class="glass-pill flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-xs font-semibold"
            :data-selected="ratio === option.value"
            @click="ratio = option.value"
          >
            <span
              v-if="!option.auto"
              class="block w-6 rounded-[3px] border-2 border-current opacity-70"
              :style="{ aspectRatio: option.aspect }"
            />
            <UIcon
              v-else
              name="i-lucide-wand-sparkles"
              class="size-4 opacity-70"
            />
            {{ option.value }}
          </button>
        </div>

        <p class="label-mono mb-2 mt-4">
          分辨率
        </p>
        <div class="flex gap-1.5">
          <button
            v-for="item in imageResolutions"
            :key="item"
            type="button"
            class="glass-pill flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold"
            :data-selected="resolution === item"
            @click="resolution = item"
          >
            {{ item }}
          </button>
        </div>

        <p class="label-mono mt-3">
          输出尺寸 {{ size }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
