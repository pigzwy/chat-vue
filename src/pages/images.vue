<script setup lang="ts">
import { computed, ref } from 'vue'

const imageGroup = {
  id: 25,
  name: '画图 | GPT-Image-2 ',
  model: 'gpt-image-2',
  label: 'GPT Image 2'
} as const

const prompt = ref('')
const ratio = ref<'1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'Auto'>('16:9')
const resolution = ref<'1K' | '2K' | '4K'>('2K')
const files = ref<File[]>([])
const queue = ref<Array<{
  id: string
  prompt: string
  ratio: string
  resolution: string
  model: string
  groupId: number
  createdAt: Date
}>>([])
const fileInput = ref<HTMLInputElement | null>(null)

const promptLimit = 5000
const canSubmit = computed(() => prompt.value.trim().length > 0)
const estimatedCost = computed(() => {
  return {
    '1K': 0.15,
    '2K': 0.2,
    '4K': 0.3
  }[resolution.value]
})

const ratioItems = ['1:1', '16:9', '9:16', '4:3', '3:4', 'Auto'] as const
const resolutionItems = ['1K', '2K', '4K'] as const

function pickFiles() {
  fileInput.value?.click()
}

function onFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || [])
  files.value = [...files.value, ...selected].slice(0, 8)
  input.value = ''
}

function submitImageTask() {
  if (!canSubmit.value) return

  queue.value.unshift({
    id: crypto.randomUUID(),
    prompt: prompt.value.trim(),
    ratio: ratio.value,
    resolution: resolution.value,
    model: imageGroup.model,
    groupId: imageGroup.id,
    createdAt: new Date()
  })
  prompt.value = ''
}
</script>

<template>
  <div class="flex-1 overflow-auto bg-muted/40">
    <div class="grid min-h-full gap-5 p-4 lg:grid-cols-[1fr_minmax(360px,460px)] lg:p-6">
      <section class="min-h-[640px] rounded-3xl border border-default bg-default p-6 shadow-sm sm:p-8">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-xl font-bold text-highlighted">
              图片队列
            </h1>
            <p class="mt-2 text-sm text-muted">
              生成任务会在这里展示，后续接入接口后用于预览、下载和复用参数。
            </p>
          </div>
          <UBadge
            :label="queue.length ? `${queue.length} 个任务` : '等待提交'"
            color="neutral"
            variant="outline"
            size="lg"
            class="rounded-full"
          />
        </div>

        <div
          v-if="!queue.length"
          class="flex min-h-[500px] flex-col items-center justify-center text-center"
        >
          <div class="flex size-24 items-center justify-center rounded-3xl bg-muted text-muted shadow-inner">
            <UIcon
              name="i-lucide-image"
              class="size-9"
            />
          </div>
          <h2 class="mt-6 text-xl font-bold text-highlighted">
            暂无图片队列
          </h2>
          <p class="mt-3 max-w-sm text-sm leading-6 text-muted">
            在右侧输入画图需求后提交，任务会以卡片形式出现在这里。
          </p>
        </div>

        <div
          v-else
          class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <article
            v-for="item in queue"
            :key="item.id"
            class="rounded-2xl border border-default bg-elevated/40 p-4"
          >
            <div class="flex aspect-square items-center justify-center rounded-xl bg-muted text-muted">
              <UIcon
                name="i-lucide-image-plus"
                class="size-8"
              />
            </div>
            <div class="mt-4 flex items-center justify-between gap-2">
              <UBadge
                label="等待接口"
                color="neutral"
                variant="subtle"
              />
              <span class="text-xs text-muted">{{ item.resolution }} · {{ item.ratio }}</span>
            </div>
            <p class="mt-3 line-clamp-3 text-sm text-muted">
              {{ item.prompt }}
            </p>
          </article>
        </div>
      </section>

      <section class="flex min-h-[640px] flex-col rounded-3xl border border-default bg-default shadow-sm">
        <div class="border-b border-default p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                画图
              </h2>
              <p class="mt-1 text-sm text-muted">
                像聊天一样描述图片需求。
              </p>
            </div>
            <UBadge
              :label="`Group #${imageGroup.id}`"
              color="neutral"
              variant="outline"
            />
          </div>
        </div>

        <div class="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <div class="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted text-muted">
              <UIcon
                name="i-lucide-sparkles"
                class="size-7"
              />
            </div>
            <h3 class="mt-5 text-xl font-bold text-highlighted">
              描述你想生成的图片
            </h3>
            <p class="mt-2 max-w-xs text-sm leading-6 text-muted">
              支持补充产品图、场景、比例和清晰度；当前仅创建本地任务，接口稍后接入。
            </p>
          </div>
        </div>

        <form
          class="border-t border-default p-4"
          @submit.prevent="submitImageTask"
        >
          <div class="rounded-3xl border border-default bg-elevated/30 p-3 shadow-xs">
            <UTextarea
              v-model="prompt"
              :maxlength="promptLimit"
              autoresize
              :rows="3"
              placeholder="描述你想生成的图片..."
              variant="none"
              :ui="{ base: 'resize-none text-base' }"
            />

            <div class="mt-2 flex items-center justify-between gap-3 border-t border-default pt-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <UPopover>
                  <UButton
                    icon="i-lucide-sliders-horizontal"
                    color="neutral"
                    variant="outline"
                    :label="`${resolution} · ${ratio}`"
                    class="rounded-full"
                  />

                  <template #content>
                    <div class="w-[420px] max-w-[calc(100vw-2rem)] space-y-8 p-5">
                      <div>
                        <h3 class="text-base font-bold text-highlighted">
                          生图参数
                        </h3>
                        <p class="mt-1 text-sm text-muted">
                          调整生成图片的画幅比例与清晰度。
                        </p>
                      </div>

                      <div class="space-y-3">
                        <div class="text-sm font-semibold text-muted">
                          画面比例
                        </div>
                        <div class="grid grid-cols-3 gap-3">
                          <button
                            v-for="item in ratioItems"
                            :key="item"
                            type="button"
                            class="rounded-xl px-4 py-3 text-center text-sm font-medium transition"
                            :class="ratio === item ? 'bg-neutral-950 text-white shadow-sm dark:bg-white dark:text-neutral-950' : 'text-highlighted hover:bg-muted'"
                            @click="ratio = item"
                          >
                            {{ item }}
                          </button>
                        </div>
                      </div>

                      <div class="space-y-3">
                        <div class="text-sm font-semibold text-muted">
                          分辨率
                        </div>
                        <div class="grid grid-cols-3 gap-3">
                          <button
                            v-for="item in resolutionItems"
                            :key="item"
                            type="button"
                            class="rounded-xl px-4 py-3 text-center text-base font-bold transition"
                            :class="resolution === item ? 'bg-neutral-950 text-white shadow-sm dark:bg-white dark:text-neutral-950' : 'text-highlighted hover:bg-muted'"
                            @click="resolution = item"
                          >
                            {{ item }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </template>
                </UPopover>

                <div class="h-6 w-px bg-default" />

                <UButton
                  icon="i-lucide-zap"
                  color="neutral"
                  variant="soft"
                  :label="imageGroup.label"
                  trailing-icon="i-lucide-lock"
                  class="rounded-full"
                />

                <input
                  ref="fileInput"
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  class="hidden"
                  @change="onFilesChange"
                >
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="ghost"
                  :label="files.length ? `${files.length}/8` : undefined"
                  class="rounded-full"
                  :disabled="files.length >= 8"
                  @click="pickFiles"
                />
              </div>

              <div class="flex items-center gap-3">
                <span class="hidden text-sm text-muted sm:inline">${{ estimatedCost.toFixed(2) }}</span>
                <UButton
                  type="submit"
                  icon="i-lucide-arrow-up"
                  color="neutral"
                  :disabled="!canSubmit"
                  class="rounded-full"
                />
              </div>
            </div>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
