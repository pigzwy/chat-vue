<script setup lang="ts">
import { computed, ref } from 'vue'
import { useModels } from '../composables/useModels'
import { useCsrf } from '../composables/useCsrf'

type ImageRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'Auto'
type ImageResolution = '1K' | '2K' | '4K'
type TaskStatus = 'generating' | 'completed' | 'error'

interface ImageGenerationResponse {
  data?: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
  }>
  error?: {
    message?: string
  }
}

interface RequestError extends Error {
  status?: number
}

interface ImageTask {
  id: string
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
  model: string
  groupId: number
  status: TaskStatus
  imageUrl?: string
  revisedPrompt?: string
  error?: string
  createdAt: Date
}

const imageGroup = {
  id: 25,
  name: '画图 | GPT-Image-2 ',
  model: 'gpt-image-2',
  label: 'GPT Image 2'
} as const

const imageSizeMap: Record<ImageResolution, Record<ImageRatio, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '16:9': '1024x576',
    '9:16': '576x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
    Auto: 'auto'
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    Auto: 'auto'
  },
  '4K': {
    '1:1': '4096x4096',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
    '4:3': '4096x3072',
    '3:4': '3072x4096',
    Auto: 'auto'
  }
}

const toast = useToast()
const { clearApiKeyForGroup, getApiKeyForGroup } = useModels()
const { csrf, headerName } = useCsrf()
const prompt = ref('')
const ratio = ref<ImageRatio>('16:9')
const resolution = ref<ImageResolution>('2K')
const files = ref<File[]>([])
const queue = ref<ImageTask[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const previewTask = ref<ImageTask | null>(null)

const promptLimit = 5000
const canSubmit = computed(() => prompt.value.trim().length > 0)
const estimatedCost = computed(() => {
  return {
    '1K': 0.15,
    '2K': 0.2,
    '4K': 0.3
  }[resolution.value]
})
const imageSize = computed(() => {
  return imageSizeMap[resolution.value][ratio.value]
})

const ratioItems: ImageRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', 'Auto']
const resolutionItems: ImageResolution[] = ['1K', '2K', '4K']

function pickFiles() {
  fileInput.value?.click()
}

function onFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || [])
  files.value = [...files.value, ...selected].slice(0, 8)
  input.value = ''
}

function toErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (!message) return '图片生成失败'

  try {
    const parsed = JSON.parse(message)
    return parsed.error?.message || parsed.message || message
  } catch {
    return message
  }
}

function parseJson<T>(text: string) {
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function updateTask(id: string, patch: Partial<ImageTask>) {
  const index = queue.value.findIndex(item => item.id === id)
  if (index === -1) return

  const current = queue.value[index]
  if (!current) return

  queue.value.splice(index, 1, {
    ...current,
    ...patch
  })
}

function toImageUrl(image: NonNullable<ImageGenerationResponse['data']>[number]) {
  if (image.url) return image.url
  if (!image.b64_json) return ''

  return image.b64_json.startsWith('data:')
    ? image.b64_json
    : `data:image/png;base64,${image.b64_json}`
}

async function requestImageGeneration(apiKey: string, task: {
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
}) {
  const response = await fetch('/api/images/generations', {
    method: 'POST',
    headers: {
      [headerName]: csrf(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      apiKey,
      prompt: task.prompt,
      ratio: task.ratio,
      resolution: task.resolution,
      size: task.size
    })
  })

  let resultText = await response.text()
  const result = parseJson<ImageGenerationResponse>(resultText) || {}
  if (!result.error?.message && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(result.error?.message || resultText || `图片生成失败: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }

  return result
}

function previewImage(task: ImageTask) {
  if (!task.imageUrl) return
  previewTask.value = task
}

function closePreview() {
  previewTask.value = null
}

function downloadImage(task: ImageTask) {
  if (!task.imageUrl) return

  const link = document.createElement('a')
  link.href = task.imageUrl
  link.download = `gpt-image-2-${task.id}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function submitImageTask() {
  if (!canSubmit.value) return

  const task = {
    id: crypto.randomUUID(),
    prompt: prompt.value.trim(),
    ratio: ratio.value,
    resolution: resolution.value,
    size: imageSize.value,
    model: imageGroup.model,
    groupId: imageGroup.id,
    status: 'generating' as const,
    createdAt: new Date()
  }
  queue.value.unshift(task)
  prompt.value = ''

  try {
    let apiKey = await getApiKeyForGroup(imageGroup.id)
    let result: ImageGenerationResponse
    try {
      result = await requestImageGeneration(apiKey, task)
    } catch (error) {
      const status = (error as RequestError).status
      if (status !== 401 && status !== 403) {
        throw error
      }

      clearApiKeyForGroup(imageGroup.id)
      apiKey = await getApiKeyForGroup(imageGroup.id)
      result = await requestImageGeneration(apiKey, task)
    }

    const image = result.data?.[0]
    if (!image?.b64_json && !image?.url) {
      throw new Error('图片接口未返回图片数据')
    }

    updateTask(task.id, {
      status: 'completed' as const,
      imageUrl: toImageUrl(image),
      revisedPrompt: image.revised_prompt
    })
  } catch (error) {
    const message = toErrorMessage(error)
    updateTask(task.id, {
      status: 'error' as const,
      error: message
    })
    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  }
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
            <div class="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted text-muted">
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.revisedPrompt || item.prompt"
                class="size-full object-cover"
              >
              <div
                v-if="item.imageUrl"
                class="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
              >
                <UButton
                  type="button"
                  icon="i-lucide-eye"
                  color="neutral"
                  variant="solid"
                  size="lg"
                  class="rounded-full"
                  aria-label="Preview image"
                  @click="previewImage(item)"
                />
                <UButton
                  type="button"
                  icon="i-lucide-download"
                  color="neutral"
                  variant="solid"
                  size="lg"
                  class="rounded-full"
                  aria-label="Download image"
                  @click="downloadImage(item)"
                />
              </div>
              <UIcon
                v-else-if="item.status === 'generating'"
                name="i-lucide-loader-circle"
                class="size-8 animate-spin"
              />
              <UIcon
                v-else-if="item.status === 'error'"
                name="i-lucide-circle-alert"
                class="size-8 text-error"
              />
              <UIcon
                v-else
                name="i-lucide-image-plus"
                class="size-8"
              />
            </div>
            <div class="mt-4 flex items-center justify-between gap-2">
              <UBadge
                :label="item.status === 'completed' ? '已完成' : item.status === 'error' ? '失败' : '生成中'"
                :color="item.status === 'completed' ? 'success' : item.status === 'error' ? 'error' : 'neutral'"
                variant="subtle"
              />
              <span class="text-xs text-muted">{{ item.resolution }} · {{ item.ratio }} · {{ item.size }}</span>
            </div>
            <p
              v-if="item.error"
              class="mt-3 line-clamp-2 text-sm text-error"
            >
              {{ item.error }}
            </p>
            <p class="mt-3 line-clamp-3 text-sm text-muted">
              {{ item.prompt }}
            </p>
          </article>
        </div>
      </section>

      <section class="flex min-h-[640px] flex-col rounded-3xl border border-default bg-default shadow-sm">
        <div class="border-b border-default p-5">
          <div>
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                画图
              </h2>
              <p class="mt-1 text-sm text-muted">
                像聊天一样描述图片需求。
              </p>
            </div>
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
                    type="button"
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
                  type="button"
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
                  type="button"
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

    <div
      v-if="previewTask?.imageUrl"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePreview"
    >
      <div class="relative max-h-full max-w-6xl">
        <UButton
          type="button"
          icon="i-lucide-x"
          color="neutral"
          variant="solid"
          class="absolute right-3 top-3 z-10 rounded-full"
          aria-label="Close preview"
          @click="closePreview"
        />
        <img
          :src="previewTask.imageUrl"
          :alt="previewTask.revisedPrompt || previewTask.prompt"
          class="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
        >
      </div>
    </div>
  </div>
</template>
