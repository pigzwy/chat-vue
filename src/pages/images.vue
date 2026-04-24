<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useModels } from '../composables/useModels'
import { useCsrf } from '../composables/useCsrf'
import ModalConfirm from '../components/ModalConfirm.vue'

type ImageRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'Auto'
type ImageResolution = '1K' | '2K' | '4K'
type ImageTaskType = 'generation' | 'edit'
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
  type: ImageTaskType
  parentId?: string
  sourceImageIds?: string[]
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
  durationSeconds?: number
  createdAt: Date
}

interface StoredImageTask extends Omit<ImageTask, 'createdAt'> {
  createdAt: string
}

interface UploadedImage {
  id: string
  file: File
  previewUrl: string
  name: string
  size: number
  type: string
}

const imageGroup = {
  id: 25,
  name: '画图 | GPT-Image-2 ',
  model: 'gpt-image-2',
  label: 'GPT Image 2'
} as const
const imageApiKeyName = 'chat | draw'
const imageStorageKey = 'sub2api-image-tasks'
const imageStorageLimit = 12
const uploadedImageLimit = 8
const imageRequestTimeoutMs = 180000
const ratioItems: ImageRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', 'Auto']
const resolutionItems: ImageResolution[] = ['1K', '2K', '4K']

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
const overlay = useOverlay()
const { clearApiKeyForGroup, getApiKeyForGroup } = useModels()
const { csrf, headerName } = useCsrf()
const prompt = ref('')
const ratio = ref<ImageRatio>('16:9')
const resolution = ref<ImageResolution>('2K')
const files = ref<UploadedImage[]>([])
const queue = ref<ImageTask[]>(loadStoredTasks())
const fileInput = ref<HTMLInputElement | null>(null)
const previewTask = ref<ImageTask | null>(null)
const previewUploadedImage = ref<UploadedImage | null>(null)
const selectedTaskId = ref('')
const timerNow = ref(Date.now())
let durationTimer: ReturnType<typeof setInterval> | null = null

const promptLimit = 5000
const deleteImageModal = overlay.create(ModalConfirm, {
  props: {
    title: '删除图片',
    description: '确定要删除这张图片记录吗？此操作只会从当前浏览器历史中移除。'
  }
})
const canSubmit = computed(() => prompt.value.trim().length > 0)
const hasUploadedImages = computed(() => files.value.length > 0)
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
const selectedTask = computed(() => {
  return queue.value.find(item => item.id === selectedTaskId.value && item.imageUrl) || null
})
const submitLabel = computed(() => {
  if (hasUploadedImages.value) return '编辑上传图片'
  return selectedTask.value ? '编辑所选图片' : '生成图片'
})
const panelDescription = computed(() => {
  if (hasUploadedImages.value) return '基于本地上传的图片继续修改。'
  return selectedTask.value ? '基于左侧选中的图片继续修改。' : '像聊天一样描述图片需求。'
})
const promptPlaceholder = computed(() => {
  if (hasUploadedImages.value) return '描述你想怎么编辑上传的图片...'
  return selectedTask.value ? '描述你想怎么编辑这张图片...' : '描述你想生成的图片...'
})
const previewImageUrl = computed(() => previewTask.value?.imageUrl || previewUploadedImage.value?.previewUrl || '')
const previewImageAlt = computed(() => {
  if (previewTask.value) return previewTask.value.revisedPrompt || previewTask.value.prompt
  return previewUploadedImage.value?.name || 'Uploaded image'
})
const selectedHistory = computed(() => {
  if (!selectedTask.value) return []

  const byId = new Map(queue.value.map(item => [item.id, item]))
  const history: ImageTask[] = []
  let current: ImageTask | undefined = selectedTask.value
  while (current) {
    history.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return history
})

function isImageRatio(value: unknown): value is ImageRatio {
  return typeof value === 'string' && ratioItems.includes(value as ImageRatio)
}

function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === 'string' && resolutionItems.includes(value as ImageResolution)
}

function toStoredTask(task: ImageTask): StoredImageTask {
  return {
    ...task,
    createdAt: task.createdAt.toISOString()
  }
}

function createImageTaskId() {
  return crypto.randomUUID()
}

function normalizeStoredTaskId(id: string | undefined, usedIds: Set<string>) {
  if (id && !usedIds.has(id)) {
    usedIds.add(id)
    return id
  }

  const nextId = createImageTaskId()
  usedIds.add(nextId)
  return nextId
}

function fromStoredTask(task: StoredImageTask, usedIds: Set<string>): ImageTask | null {
  if (!isImageRatio(task.ratio) || !isImageResolution(task.resolution)) return null

  return {
    ...task,
    id: normalizeStoredTaskId(task.id, usedIds),
    type: task.type === 'edit' ? 'edit' : 'generation',
    status: task.status === 'generating' ? 'error' : task.status,
    error: task.status === 'generating' ? 'Task was interrupted by refresh' : task.error,
    createdAt: new Date(task.createdAt)
  }
}

function loadStoredTasks() {
  if (typeof window === 'undefined') return []

  const text = window.localStorage.getItem(imageStorageKey)
  if (!text) return []

  const parsed = parseJson<StoredImageTask[]>(text)
  if (!Array.isArray(parsed)) return []

  const usedIds = new Set<string>()
  return parsed
    .map(task => fromStoredTask(task, usedIds))
    .filter((task): task is ImageTask => Boolean(task))
}

function persistTasks(tasks: ImageTask[]) {
  if (typeof window === 'undefined') return

  let next = tasks.slice(0, imageStorageLimit)
  while (next.length) {
    try {
      window.localStorage.setItem(imageStorageKey, JSON.stringify(next.map(toStoredTask)))
      return
    } catch {
      next = next.slice(0, -1)
    }
  }

  window.localStorage.removeItem(imageStorageKey)
}

watch(queue, persistTasks, { deep: true })

onMounted(() => {
  durationTimer = setInterval(() => {
    timerNow.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (durationTimer) {
    clearInterval(durationTimer)
  }
  clearUploadedImages()
})

function pickFiles() {
  fileInput.value?.click()
}

function createUploadedImage(file: File): UploadedImage {
  return {
    id: createImageTaskId(),
    file,
    previewUrl: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
    type: file.type
  }
}

function revokeUploadedImage(image: UploadedImage) {
  URL.revokeObjectURL(image.previewUrl)
}

function removeUploadedImage(id: string) {
  const target = files.value.find(item => item.id === id)
  if (!target) return

  revokeUploadedImage(target)
  files.value = files.value.filter(item => item.id !== id)
  if (previewUploadedImage.value?.id === id) {
    previewUploadedImage.value = null
  }
}

function clearUploadedImages() {
  files.value.forEach(revokeUploadedImage)
  files.value = []
  previewUploadedImage.value = null
}

function onFilesChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || [])
  const remaining = uploadedImageLimit - files.value.length
  if (remaining <= 0) {
    toast.add({
      description: `最多上传 ${uploadedImageLimit} 张图片`,
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
    input.value = ''
    return
  }

  const accepted = selected.slice(0, remaining)
  files.value = [...files.value, ...accepted.map(createUploadedImage)]
  if (selected.length > remaining) {
    toast.add({
      description: `最多上传 ${uploadedImageLimit} 张图片，已自动保留前 ${remaining} 张`,
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
  }
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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), imageRequestTimeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('图片请求超时，请稍后重试')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function requestImageGeneration(apiKey: string, task: {
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
}) {
  const response = await fetchWithTimeout('/api/images/generations', {
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

async function imageUrlToFile(imageUrl: string, filename: string) {
  const response = await fetch(imageUrl)
  const blob = await response.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

async function requestImageEdit(apiKey: string, task: {
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
}, sources: File[]) {
  if (!sources.length) {
    throw new Error('缺少要编辑的图片')
  }

  const formData = new FormData()
  formData.set('apiKey', apiKey)
  formData.set('prompt', task.prompt)
  formData.set('ratio', task.ratio)
  formData.set('resolution', task.resolution)
  formData.set('size', task.size)
  sources.forEach((source) => {
    formData.append('image', source)
  })

  const response = await fetchWithTimeout('/api/images/edits', {
    method: 'POST',
    headers: {
      [headerName]: csrf()
    },
    body: formData
  })

  let resultText = await response.text()
  const result = parseJson<ImageGenerationResponse>(resultText) || {}
  if (!result.error?.message && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(result.error?.message || resultText || `图片编辑失败: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }

  return result
}

function previewImage(task: ImageTask) {
  if (!task.imageUrl) return
  previewUploadedImage.value = null
  previewTask.value = task
}

function previewUploadedSource(image: UploadedImage) {
  previewTask.value = null
  previewUploadedImage.value = image
}

function closePreview() {
  previewTask.value = null
  previewUploadedImage.value = null
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

async function deleteImageTask(task: ImageTask) {
  const instance = deleteImageModal.open()
  const result = await instance.result
  if (!result) return

  // 只删除用户点击的这一张。旧 localStorage 数据可能存在重复 id，不能按 id 批量过滤。
  const targetIndex = queue.value.findIndex(item => item === task)
  const fallbackIndex = queue.value.filter(item => item.id === task.id).length === 1
    ? queue.value.findIndex(item => item.id === task.id)
    : -1
  const index = targetIndex === -1 ? fallbackIndex : targetIndex
  if (index === -1) return

  queue.value.splice(index, 1)

  if (selectedTaskId.value === task.id) {
    selectedTaskId.value = ''
  }
  if (previewTask.value?.id === task.id) {
    previewTask.value = null
  }

  toast.add({
    title: '图片已删除',
    description: '已从本地图片历史中移除',
    icon: 'i-lucide-trash'
  })
}

function selectImageTask(task: ImageTask) {
  if (!task.imageUrl) return
  selectedTaskId.value = selectedTaskId.value === task.id ? '' : task.id
}

function clearSelectedTask() {
  selectedTaskId.value = ''
}

function getTaskById(id?: string) {
  if (!id) return null
  return queue.value.find(item => item.id === id) || null
}

function getTaskNumber(task?: ImageTask | null) {
  if (!task) return ''

  const index = queue.value.findIndex(item => item.id === task.id)
  if (index === -1) return ''

  return `#${queue.value.length - index}`
}

function reusePrompt(task: ImageTask) {
  prompt.value = task.prompt
}

function setCurrentTask(task: ImageTask) {
  if (!task.imageUrl) return
  selectedTaskId.value = task.id
}

function getDurationSeconds(startedAt: Date) {
  return Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 1000))
}

function getTaskDurationSeconds(task: ImageTask) {
  if (task.durationSeconds) return task.durationSeconds
  if (task.status !== 'generating') return 0

  return Math.max(1, Math.round((timerNow.value - task.createdAt.getTime()) / 1000))
}

async function submitImageTask() {
  if (!canSubmit.value) return
  const uploadedSources = files.value.map(item => item.file)
  const sourceTask = uploadedSources.length ? null : selectedTask.value

  const task: ImageTask = {
    id: createImageTaskId(),
    type: sourceTask || uploadedSources.length ? 'edit' : 'generation',
    parentId: sourceTask?.id,
    sourceImageIds: sourceTask ? [sourceTask.id] : undefined,
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
    let apiKey = await getApiKeyForGroup(imageGroup.id, imageApiKeyName)
    const editSources = [...uploadedSources]
    if (!editSources.length && sourceTask?.imageUrl) {
      editSources.push(await imageUrlToFile(sourceTask.imageUrl, `source-${sourceTask.id}.png`))
    }

    let result: ImageGenerationResponse
    try {
      result = editSources.length
        ? await requestImageEdit(apiKey, task, editSources)
        : await requestImageGeneration(apiKey, task)
    } catch (error) {
      const status = (error as RequestError).status
      if (status !== 401 && status !== 403) {
        throw error
      }

      clearApiKeyForGroup(imageGroup.id)
      apiKey = await getApiKeyForGroup(imageGroup.id, imageApiKeyName)
      result = editSources.length
        ? await requestImageEdit(apiKey, task, editSources)
        : await requestImageGeneration(apiKey, task)
    }

    const image = result.data?.[0]
    if (!image?.b64_json && !image?.url) {
      throw new Error('图片接口未返回图片数据')
    }

    updateTask(task.id, {
      status: 'completed' as const,
      imageUrl: toImageUrl(image),
      revisedPrompt: image.revised_prompt,
      durationSeconds: getDurationSeconds(task.createdAt)
    })
    if (sourceTask) {
      selectedTaskId.value = task.id
    }
    if (uploadedSources.length) {
      clearUploadedImages()
    }
  } catch (error) {
    const message = toErrorMessage(error)
    updateTask(task.id, {
      status: 'error' as const,
      error: message,
      durationSeconds: getDurationSeconds(task.createdAt)
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
  <div class="flex-1 min-h-0 overflow-hidden bg-muted/40">
    <div class="grid h-full min-h-0 gap-5 p-4 pt-0 lg:grid-cols-[1fr_minmax(360px,460px)] lg:p-6 lg:pt-0">
      <section class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-default bg-default p-5 shadow-sm sm:p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-xl font-bold text-highlighted">
              图片队列
            </h1>
            <p class="mt-2 text-sm text-muted">
              左侧保存生成结果，选中图片后可在右侧继续编辑。
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
          class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
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
            在右侧输入画图需求后提交，结果会以卡片形式保存在这里。
          </p>
        </div>

        <div
          v-else
          class="mt-8 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="item in queue"
              :key="item.id"
              class="cursor-pointer rounded-2xl border bg-elevated/40 p-4 transition"
              :class="selectedTaskId === item.id ? 'border-primary ring-2 ring-primary/20' : 'border-default hover:border-muted'"
              @click="selectImageTask(item)"
            >
              <div class="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted text-muted">
                <UBadge
                  v-if="selectedTaskId === item.id"
                  label="正在编辑"
                  color="primary"
                  variant="solid"
                  class="absolute left-3 top-3 z-10 rounded-full"
                />
                <UButton
                  v-if="item.status === 'error'"
                  type="button"
                  icon="i-lucide-trash"
                  color="error"
                  variant="solid"
                  size="sm"
                  class="absolute right-3 top-3 z-10 rounded-full"
                  aria-label="Delete failed image"
                  @click.stop="deleteImageTask(item)"
                />
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.revisedPrompt || item.prompt"
                  class="size-full object-cover"
                >
                <div
                  v-if="item.imageUrl"
                  class="absolute right-3 top-3 z-10 flex gap-2 opacity-0 transition group-hover:opacity-100"
                >
                  <UButton
                    type="button"
                    icon="i-lucide-eye"
                    color="neutral"
                    variant="solid"
                    size="sm"
                    class="rounded-full"
                    aria-label="Preview image"
                    @click.stop="previewImage(item)"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-download"
                    color="neutral"
                    variant="solid"
                    size="sm"
                    class="rounded-full"
                    aria-label="Download image"
                    @click.stop="downloadImage(item)"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-trash"
                    color="error"
                    variant="solid"
                    size="sm"
                    class="rounded-full"
                    aria-label="Delete image"
                    @click.stop="deleteImageTask(item)"
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
              <div
                v-if="getTaskById(item.parentId)"
                class="mt-3 flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2"
              >
                <img
                  v-if="getTaskById(item.parentId)?.imageUrl"
                  :src="getTaskById(item.parentId)?.imageUrl"
                  :alt="getTaskById(item.parentId)?.prompt"
                  class="size-8 rounded-lg object-cover"
                >
                <div class="min-w-0">
                  <p class="text-xs font-medium text-highlighted">
                    编辑自 {{ getTaskNumber(getTaskById(item.parentId)) || '上一张' }}
                  </p>
                  <p class="line-clamp-1 text-xs text-muted">
                    {{ getTaskById(item.parentId)?.prompt }}
                  </p>
                </div>
              </div>
              <div class="mt-4 flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <UBadge
                    :label="item.status === 'completed' ? '已完成' : item.status === 'error' ? '失败' : '生成中'"
                    :color="item.status === 'completed' ? 'success' : item.status === 'error' ? 'error' : 'neutral'"
                    variant="subtle"
                  />
                  <span
                    v-if="getTaskDurationSeconds(item)"
                    class="shrink-0 text-xs text-muted"
                  >
                    耗时 {{ getTaskDurationSeconds(item) }}s
                  </span>
                </div>
                <UBadge
                  v-if="item.type === 'edit'"
                  label="编辑"
                  color="neutral"
                  variant="outline"
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
        </div>
      </section>

      <section class="flex h-full min-h-0 flex-col rounded-3xl border border-default bg-default shadow-sm">
        <div class="border-b border-default p-4 sm:p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                {{ submitLabel }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ panelDescription }}
              </p>
            </div>
            <UButton
              v-if="selectedTask"
              type="button"
              icon="i-lucide-plus"
              label="新建图片"
              color="neutral"
              variant="soft"
              class="shrink-0 rounded-full"
              @click="clearSelectedTask"
            />
          </div>
        </div>

        <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-6 text-center">
          <div v-if="!selectedTask">
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
              支持补充产品图、场景、比例和清晰度；生成结果会自动进入左侧图库。
            </p>
          </div>
          <div
            v-else
            class="w-full space-y-5 text-left"
          >
            <div class="rounded-2xl border border-default bg-elevated/40 p-3">
              <div class="flex items-center gap-3">
                <img
                  :src="selectedTask.imageUrl"
                  :alt="selectedTask.prompt"
                  class="size-20 rounded-xl object-cover"
                >
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-highlighted">
                    正在编辑这张图
                  </p>
                  <p class="mt-1 line-clamp-2 text-sm text-muted">
                    {{ selectedTask.prompt }}
                  </p>
                  <p class="mt-2 text-xs text-muted">
                    {{ getTaskNumber(selectedTask) }} · {{ selectedTask.resolution }} · {{ selectedTask.ratio }} · {{ selectedTask.size }}
                  </p>
                </div>
                <UButton
                  type="button"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  class="rounded-full"
                  aria-label="Clear selected image"
                  @click="clearSelectedTask"
                />
              </div>
            </div>

            <div class="space-y-3">
              <p class="text-sm font-semibold text-muted">
                编辑历史
              </p>
              <div
                v-for="historyItem in selectedHistory"
                :key="historyItem.id"
                class="rounded-2xl border border-default bg-default p-3 transition"
                :class="selectedTaskId === historyItem.id ? 'ring-2 ring-primary/15' : ''"
              >
                <div class="flex items-start gap-3">
                  <img
                    v-if="historyItem.imageUrl"
                    :src="historyItem.imageUrl"
                    :alt="historyItem.prompt"
                    class="size-14 rounded-lg object-cover"
                  >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <UBadge
                        :label="historyItem.type === 'edit' ? '编辑' : '生成'"
                        color="neutral"
                        variant="subtle"
                      />
                      <span class="text-xs text-muted">{{ getTaskNumber(historyItem) }} · {{ historyItem.resolution }} · {{ historyItem.ratio }}</span>
                    </div>
                    <p class="mt-2 line-clamp-2 text-sm text-highlighted">
                      {{ historyItem.prompt }}
                    </p>
                    <p
                      v-if="getTaskById(historyItem.parentId)"
                      class="mt-1 text-xs text-muted"
                    >
                      编辑自 {{ getTaskNumber(getTaskById(historyItem.parentId)) || '上一张' }}
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <UButton
                        type="button"
                        label="复用"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        class="rounded-full"
                        @click="reusePrompt(historyItem)"
                      />
                      <UButton
                        v-if="historyItem.imageUrl"
                        type="button"
                        :label="selectedTaskId === historyItem.id ? '当前图片' : '设为当前'"
                        color="neutral"
                        variant="soft"
                        size="xs"
                        class="rounded-full"
                        :disabled="selectedTaskId === historyItem.id"
                        @click="setCurrentTask(historyItem)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <form
          class="border-t border-default p-4"
          @submit.prevent="submitImageTask"
        >
          <div class="rounded-3xl border border-default bg-elevated/30 p-3 shadow-xs">
            <div
              v-if="files.length"
              class="mb-3 flex gap-2 overflow-x-auto pb-1"
            >
              <div
                v-for="file in files"
                :key="file.id"
                class="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-default bg-muted"
                :title="file.name"
              >
                <button
                  type="button"
                  class="block size-full"
                  @click="previewUploadedSource(file)"
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
                  class="absolute right-1 top-1 rounded-full opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove uploaded image"
                  @click="removeUploadedImage(file.id)"
                />
              </div>
            </div>

            <UTextarea
              v-model="prompt"
              :maxlength="promptLimit"
              autoresize
              :rows="3"
              :placeholder="promptPlaceholder"
              variant="none"
              :ui="{ base: 'resize-none text-base' }"
            />

            <div class="mt-2 flex flex-nowrap items-center justify-between gap-3 border-t border-default pt-3">
              <div class="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
                <UPopover>
                  <UButton
                    type="button"
                    icon="i-lucide-sliders-horizontal"
                    color="neutral"
                    variant="outline"
                    :label="`${resolution} · ${ratio}`"
                    class="shrink-0 rounded-full"
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
                  class="shrink-0 rounded-full"
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
                  icon="i-lucide-paperclip"
                  color="neutral"
                  variant="ghost"
                  :label="files.length ? `${files.length}/${uploadedImageLimit}` : undefined"
                  class="shrink-0 rounded-full"
                  :disabled="files.length >= uploadedImageLimit"
                  @click="pickFiles"
                />
              </div>

              <div class="flex shrink-0 items-center gap-3">
                <span class="hidden whitespace-nowrap text-sm text-muted sm:inline">${{ estimatedCost.toFixed(2) }}</span>
                <UButton
                  type="submit"
                  icon="i-lucide-arrow-up"
                  color="neutral"
                  :disabled="!canSubmit"
                  :aria-label="submitLabel"
                  class="shrink-0 rounded-full"
                />
              </div>
            </div>
          </div>
        </form>
      </section>
    </div>

    <div
      v-if="previewImageUrl"
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
          :src="previewImageUrl"
          :alt="previewImageAlt"
          class="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
        >
      </div>
    </div>
  </div>
</template>
