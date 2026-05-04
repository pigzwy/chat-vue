<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useModels } from '../composables/useModels'
import { useCsrf } from '../composables/useCsrf'
import ModalConfirm from '../components/ModalConfirm.vue'
import {
  defaultImageQuality,
  getImageQualityLabel,
  imageQualityItems,
  imageSizeMap,
  type ImageQuality,
  type ImageRatio,
  type ImageResolution
} from '../../shared/utils/images'
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

type GeneratedImage = NonNullable<ImageGenerationResponse['data']>[number]

interface RequestError extends Error {
  status?: number
  streamStarted?: boolean
}

interface ImageJobResponse extends ImageGenerationResponse {
  id: string
  status: 'queued' | 'running' | 'completed' | 'error'
  createdAt: string
  startedAt?: string
  completedAt?: string
  jobError?: string
  jobErrorStatus?: number
}

interface ImageTask {
  id: string
  type: ImageTaskType
  parentId?: string
  sourceImageIds?: string[]
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  quality: ImageQuality
  size: string
  model: string
  groupId: number
  status: TaskStatus
  imageUrl?: string
  revisedPrompt?: string
  error?: string
  durationSeconds?: number
  jobId?: string
  completedAt?: Date
  createdAt: Date
}

interface StoredImageTask extends Omit<ImageTask, 'createdAt' | 'completedAt'> {
  createdAt: string
  completedAt?: string
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
const imageQualityStorageKey = 'sub2api-image-quality'
const imageDatabaseName = 'sub2api-image-assets'
const imageDatabaseStoreName = 'images'
const imageStorageLimit = 12
const uploadedImageLimit = 8
const imageRequestTimeoutMs = 300000
const imageJobPollIntervalMs = 2500
const ratioItems: ImageRatio[] = ['1:1', '3:2', '16:9', '21:9', '9:16', '4:3', '3:4', 'Auto']
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
const resolutionItems: ImageResolution[] = ['1K', '2K', '4K']
const imagePromptPresets = [
  {
    label: '赛博朋克城市',
    icon: 'i-lucide-sparkles',
    color: 'text-violet-500',
    prompt: '一座充满霓虹灯和飞行器的赛博朋克风格科幻城市，夜晚，雨后街道，8k，高细节，虚幻引擎5渲染'
  },
  {
    label: '动漫插画',
    icon: 'i-lucide-image',
    color: 'text-pink-500',
    prompt: '一个可爱的二次元动漫少女，站在落日余晖的向日葵花海中，微风吹过，新海诚画风，壁纸级别'
  },
  {
    label: '皮克斯 3D',
    icon: 'i-lucide-gamepad-2',
    color: 'text-blue-500',
    prompt: '皮克斯 3D 动画风格，可爱的角色，柔和灯光，丰富表情，电影级构图，高质量渲染'
  },
  {
    label: '水彩风景',
    icon: 'i-lucide-palette',
    color: 'text-emerald-500',
    prompt: '清新的水彩风景插画，远山、湖泊、晨雾和柔和阳光，纸张纹理，干净留白'
  },
  {
    label: '写实摄影',
    icon: 'i-lucide-camera',
    color: 'text-amber-500',
    prompt: '写实摄影风格，自然光，浅景深，细腻质感，专业商业摄影构图，高清细节'
  }
]

const toast = useToast()
const overlay = useOverlay()
const { clearApiKeyForGroup, getApiKeyForGroup } = useModels()
const { csrf, headerName } = useCsrf()
const prompt = ref('')
const ratio = ref<ImageRatio>('16:9')
const resolution = ref<ImageResolution>('2K')
const quality = ref<ImageQuality>(loadStoredImageQuality())
const files = ref<UploadedImage[]>([])
const queue = ref<ImageTask[]>(loadStoredTasks())
const fileInput = ref<HTMLInputElement | null>(null)
const previewTask = ref<ImageTask | null>(null)
const previewUploadedImage = ref<UploadedImage | null>(null)
const selectedTaskId = ref('')
const batchMode = ref(false)
const selectedBatchIds = ref<string[]>([])
const isDraggingImages = ref(false)
const timerNow = ref(Date.now())
let durationTimer: ReturnType<typeof setInterval> | null = null
let imageDatabasePromise: Promise<IDBDatabase> | null = null
let isUnmounted = false
const sourceFilesByTaskId = new Map<string, File[]>()

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
    '1K': 0.135,
    '2K': 0.18,
    '4K': 0.27
  }[resolution.value]
})
const imageSize = computed(() => {
  return imageSizeMap[resolution.value][ratio.value]
})
const selectedTask = computed(() => {
  return queue.value.find(item => item.id === selectedTaskId.value && item.imageUrl) || null
})
const downloadableTasks = computed(() => queue.value.filter(item => item.imageUrl))
const selectedBatchTasks = computed(() => {
  const selected = new Set(selectedBatchIds.value)
  return queue.value.filter(item => selected.has(item.id) && item.imageUrl)
})
const submitLabel = computed(() => {
  if (hasUploadedImages.value) return '编辑上传图片'
  return selectedTask.value ? '编辑所选图片' : '生成图片'
})
const panelDescription = computed(() => {
  if (hasUploadedImages.value) return '基于本地上传的图片继续修改，支持以图生图。'
  return selectedTask.value ? '基于左侧选中的图片继续修改。' : '像聊天一样描述图片需求，也可以上传图片以图生图。'
})
const promptPlaceholder = computed(() => {
  if (hasUploadedImages.value) return '描述你想怎么编辑上传的图片...'
  return selectedTask.value ? '描述你想怎么编辑这张图片...' : '描述你想生成的图片，也可以上传或拖拽图片以图生图...'
})
const previewImageUrl = computed(() => previewTask.value?.imageUrl || previewUploadedImage.value?.previewUrl || '')
const previewImageAlt = computed(() => {
  if (previewTask.value) return previewTask.value.revisedPrompt || previewTask.value.prompt
  return previewUploadedImage.value?.name || 'Uploaded image'
})
const previewRevisedPrompt = computed(() => previewTask.value?.revisedPrompt?.trim() || '')
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
const activeQualityIcon = computed(() => {
  return imageQualityItems.find(item => item.value === quality.value)?.icon || 'i-lucide-gem'
})

function isImageRatio(value: unknown): value is ImageRatio {
  return typeof value === 'string' && ratioItems.includes(value as ImageRatio)
}

function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === 'string' && resolutionItems.includes(value as ImageResolution)
}

function isImageQuality(value: unknown): value is ImageQuality {
  return typeof value === 'string' && imageQualityItems.some(item => item.value === value)
}

function loadStoredImageQuality(): ImageQuality {
  if (typeof window === 'undefined') return defaultImageQuality

  const value = window.localStorage.getItem(imageQualityStorageKey)
  return isImageQuality(value) ? value : defaultImageQuality
}

function toStoredTask(task: ImageTask): StoredImageTask {
  const stored = {
    ...task,
    imageUrl: task.imageUrl?.startsWith('data:') ? undefined : task.imageUrl,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString()
  }

  return stored
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
    status: task.status === 'generating' && !task.jobId ? 'error' : task.status,
    error: task.status === 'generating' && !task.jobId ? '刷新中断了图片任务，请重试' : task.error,
    quality: isImageQuality(task.quality) ? task.quality : defaultImageQuality,
    completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
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

function openImageDatabase() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available'))
  }

  imageDatabasePromise ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(imageDatabaseName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(imageDatabaseStoreName)) {
        db.createObjectStore(imageDatabaseStoreName)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return imageDatabasePromise
}

async function putImageAsset(id: string, imageUrl: string) {
  if (!imageUrl.startsWith('data:')) return

  const db = await openImageDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(imageDatabaseStoreName, 'readwrite')
    tx.objectStore(imageDatabaseStoreName).put(imageUrl, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getImageAsset(id: string) {
  const db = await openImageDatabase()
  return await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(imageDatabaseStoreName, 'readonly')
    const request = tx.objectStore(imageDatabaseStoreName).get(id)
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined)
    request.onerror = () => reject(request.error)
  })
}

async function deleteImageAsset(id: string) {
  const db = await openImageDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(imageDatabaseStoreName, 'readwrite')
    tx.objectStore(imageDatabaseStoreName).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteImageAssetsExcept(ids: Set<string>) {
  const db = await openImageDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(imageDatabaseStoreName, 'readwrite')
    const store = tx.objectStore(imageDatabaseStoreName)
    const request = store.getAllKeys()
    request.onsuccess = () => {
      request.result.forEach((key) => {
        if (typeof key === 'string' && !ids.has(key)) {
          store.delete(key)
        }
      })
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function persistImageAssets(tasks: ImageTask[]) {
  try {
    await Promise.all(tasks.map(task => task.imageUrl ? putImageAsset(task.id, task.imageUrl) : undefined))
    await deleteImageAssetsExcept(new Set(tasks.map(task => task.id)))
  } catch {
    // Keep metadata persistence independent from large image asset persistence.
  }
}

async function hydrateStoredImageAssets() {
  const nextTasks = await Promise.all(queue.value.map(async (task) => {
    if (task.imageUrl?.startsWith('data:')) {
      await putImageAsset(task.id, task.imageUrl)
      return task
    }

    const imageUrl = await getImageAsset(task.id)
    return imageUrl ? { ...task, imageUrl } : task
  }))

  queue.value = nextTasks
  persistTasks(queue.value)
}

function persistTasks(tasks: ImageTask[]) {
  if (typeof window === 'undefined') return

  const next = tasks.slice(0, imageStorageLimit)
  void persistImageAssets(next)

  try {
    window.localStorage.setItem(imageStorageKey, JSON.stringify(next.map(toStoredTask)))
  } catch {
    try {
      window.localStorage.setItem(imageStorageKey, JSON.stringify(next.map(task => ({
        ...toStoredTask(task),
        imageUrl: undefined
      }))))
    } catch {
      // Keep the in-memory queue intact even if browser storage is exhausted.
    }
  }
}

watch(queue, persistTasks, { deep: true })
watch(quality, (value) => {
  window.localStorage.setItem(imageQualityStorageKey, value)
})

onMounted(() => {
  void hydrateStoredImageAssets().catch(() => {})
  resumePendingImageTasks()
  durationTimer = setInterval(() => {
    timerNow.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  isUnmounted = true
  if (durationTimer) {
    clearInterval(durationTimer)
  }
  sourceFilesByTaskId.clear()
  clearUploadedImages()
})

function pickFiles() {
  fileInput.value?.click()
}

function useImagePromptPreset(presetPrompt: string) {
  const current = prompt.value.trim()
  prompt.value = current ? `${current}，${presetPrompt}` : presetPrompt
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

function createUploadedImageFromFile(file: File, previewUrl: string): UploadedImage {
  return {
    id: createImageTaskId(),
    file,
    previewUrl,
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

function normalizeApiErrorMessage(message: string) {
  return message.replace(/sub2api/gi, 'API')
}

function getImageFiles(filesLike: FileList | File[]) {
  return Array.from(filesLike).filter(file => file.type.startsWith('image/'))
}

function appendUploadedImages(imageFiles: File[]) {
  const remaining = uploadedImageLimit - files.value.length
  if (remaining <= 0) {
    toast.add({
      description: `最多上传 ${uploadedImageLimit} 张图片`,
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
    return
  }

  const accepted = imageFiles.slice(0, remaining)
  files.value = [...files.value, ...accepted.map(createUploadedImage)]
  if (imageFiles.length > remaining) {
    toast.add({
      description: `最多上传 ${uploadedImageLimit} 张图片，已自动保留前 ${remaining} 张`,
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
  }
}

function onPasteImages(event: ClipboardEvent) {
  const imageFiles = getImageFiles(event.clipboardData?.files || [])
  if (!imageFiles.length) return

  event.preventDefault()
  appendUploadedImages(imageFiles)
}

function onDragOverImages(event: DragEvent) {
  const hasImage = Array.from(event.dataTransfer?.items || []).some(item => item.type.startsWith('image/'))
  if (!hasImage) return

  event.preventDefault()
  isDraggingImages.value = true
}

function onDragLeaveImages(event: DragEvent) {
  if (event.currentTarget !== event.target) return
  isDraggingImages.value = false
}

function onDropImages(event: DragEvent) {
  const imageFiles = getImageFiles(event.dataTransfer?.files || [])
  if (!imageFiles.length) return

  event.preventDefault()
  isDraggingImages.value = false
  appendUploadedImages(imageFiles)
}

function toErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (!message) return '图片生成失败'

  try {
    const parsed = JSON.parse(message)
    return normalizeApiErrorMessage(parsed.error?.message || parsed.message || message)
  } catch {
    return normalizeApiErrorMessage(message)
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

  if (patch.imageUrl) {
    void putImageAsset(current.id, patch.imageUrl).catch(() => {})
  }

  queue.value.splice(index, 1, {
    ...current,
    ...patch
  })
}

function toImageUrl(image: GeneratedImage) {
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

async function createImageGenerationJob(apiKey: string, task: {
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  quality: ImageQuality
  size: string
}) {
  const response = await fetchWithTimeout('/api/images/jobs', {
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
      quality: task.quality,
      size: task.size
    })
  })

  let resultText = await response.text()
  const result = parseJson<ImageJobResponse>(resultText) || ({} as ImageJobResponse)
  if (!result?.error?.message && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(result?.error?.message || resultText || `图片任务创建失败: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }
  if (!result?.id) {
    throw new Error('图片任务创建失败')
  }

  return result
}

async function getImageGenerationJob(jobId: string) {
  const response = await fetchWithTimeout(`/api/images/jobs/${jobId}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  let resultText = await response.text()
  const result = parseJson<ImageJobResponse>(resultText) || ({} as ImageJobResponse)
  if (!result?.error?.message && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(result?.error?.message || resultText || `图片任务查询失败: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }
  if (!result?.id) {
    throw new Error('图片任务查询失败')
  }

  return result
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function pollImageGenerationJob(jobId: string) {
  while (true) {
    if (isUnmounted) {
      throw new Error('图片任务已暂停，请刷新后继续查看')
    }

    const job = await getImageGenerationJob(jobId)
    if (job.status === 'completed') {
      if (!job.data?.[0]?.b64_json && !job.data?.[0]?.url) {
        throw new Error('图片接口未返回图片数据')
      }

      return job
    }
    if (job.status === 'error') {
      if (job.jobErrorStatus) {
        const error = new Error(job.jobError || 'Image generation failed') as RequestError
        error.status = job.jobErrorStatus
        throw error
      }
      throw new Error(job.jobError || '图片生成失败')
    }

    await wait(imageJobPollIntervalMs)
  }
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
  quality: ImageQuality
  size: string
  id?: string
}, sources: File[]) {
  if (!sources.length) {
    throw new Error('缺少要编辑的图片')
  }

  const formData = new FormData()
  formData.set('apiKey', apiKey)
  formData.set('prompt', task.prompt)
  formData.set('ratio', task.ratio)
  formData.set('resolution', task.resolution)
  formData.set('quality', task.quality)
  formData.set('size', task.size)
  sources.forEach((source) => {
    formData.append('image', source)
  })

  const response = await fetchWithTimeout('/api/images/jobs/edits', {
    method: 'POST',
    headers: {
      [headerName]: csrf()
    },
    body: formData
  })

  let resultText = await response.text()
  const result = parseJson<ImageJobResponse>(resultText) || ({} as ImageJobResponse)
  if (!result?.error?.message && resultText.trim().startsWith('<')) {
    resultText = ''
  }
  if (!response.ok) {
    const error = new Error(result.error?.message || resultText || `图片编辑失败: ${response.status}`) as RequestError
    error.status = response.status
    throw error
  }

  if (!result?.id) {
    throw new Error('Image edit job creation failed')
  }

  if (task.id) {
    updateTask(task.id, { jobId: result.id })
  }
  return pollImageGenerationJob(result.id)
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

function getImageDownloadFilename(task: Pick<ImageTask, 'id' | 'createdAt'>) {
  const createdAt = task.createdAt
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)

  return `gpt-image-2-${createdAt}-${task.id}.png`
}

function downloadImage(task: ImageTask) {
  if (!task.imageUrl) return

  const link = document.createElement('a')
  link.href = task.imageUrl
  link.download = getImageDownloadFilename(task)
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  selectedBatchIds.value = []
}

function toggleBatchTask(task: ImageTask) {
  if (!task.imageUrl) return

  const selected = new Set(selectedBatchIds.value)
  if (selected.has(task.id)) {
    selected.delete(task.id)
  } else {
    selected.add(task.id)
  }
  selectedBatchIds.value = Array.from(selected)
}

function selectAllBatchTasks() {
  selectedBatchIds.value = downloadableTasks.value.map(task => task.id)
}

function downloadSelectedImages() {
  selectedBatchTasks.value.forEach((task, index) => {
    window.setTimeout(() => downloadImage(task), index * 150)
  })
}

async function deleteSelectedImages() {
  if (!selectedBatchTasks.value.length) return

  const instance = deleteImageModal.open()
  const result = await instance.result
  if (!result) return

  const selected = new Set(selectedBatchTasks.value.map(task => task.id))
  queue.value = queue.value.filter(task => !selected.has(task.id))
  selected.forEach(id => {
    void deleteImageAsset(id).catch(() => {})
  })

  if (selectedTaskId.value && selected.has(selectedTaskId.value)) {
    selectedTaskId.value = ''
  }
  if (previewTask.value?.id && selected.has(previewTask.value.id)) {
    previewTask.value = null
  }
  selectedBatchIds.value = []
  batchMode.value = false

  toast.add({
    title: '图片已删除',
    description: `已删除 ${selected.size} 张图片`,
    icon: 'i-lucide-trash'
  })
}

async function copyImage(task: ImageTask) {
  if (!task.imageUrl) return

  try {
    const file = await imageUrlToFile(task.imageUrl, getImageDownloadFilename(task))
    await navigator.clipboard.write([
      new ClipboardItem({ [file.type || 'image/png']: file })
    ])
    toast.add({
      title: '图片已复制',
      description: '已复制到剪贴板',
      icon: 'i-lucide-copy'
    })
  } catch {
    toast.add({
      title: '复制失败',
      description: '当前浏览器不支持复制图片，请使用下载',
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
  }
}

async function addTaskImageAsReference(task: ImageTask) {
  if (!task.imageUrl) return

  const remaining = uploadedImageLimit - files.value.length
  if (remaining <= 0) {
    toast.add({
      description: `最多上传 ${uploadedImageLimit} 张图片`,
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
    return
  }

  try {
    const file = await imageUrlToFile(task.imageUrl, getImageDownloadFilename(task))
    const previewUrl = URL.createObjectURL(file)
    files.value = [...files.value, createUploadedImageFromFile(file, previewUrl)]
    clearSelectedTask()
    closePreview()
    toast.add({
      title: '已加入参考图',
      description: '会在下一次提交时作为编辑参考',
      icon: 'i-lucide-paperclip'
    })
  } catch {
    toast.add({
      title: '加入参考图失败',
      description: '图片读取失败，请重新生成或下载后上传',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  }
}

function getImageActionItems(task: ImageTask): DropdownMenuItem[][] {
  return [[
    {
      label: '预览',
      icon: 'i-lucide-eye',
      onSelect: () => previewImage(task)
    },
    {
      label: '设为当前编辑',
      icon: 'i-lucide-pencil',
      disabled: selectedTaskId.value === task.id,
      onSelect: () => setCurrentTask(task)
    },
    {
      label: '加入参考图',
      icon: 'i-lucide-paperclip',
      onSelect: () => {
        void addTaskImageAsReference(task)
      }
    }
  ], [
    {
      label: '复制图片',
      icon: 'i-lucide-copy',
      onSelect: () => {
        void copyImage(task)
      }
    },
    {
      label: '下载',
      icon: 'i-lucide-download',
      onSelect: () => downloadImage(task)
    }
  ], [
    {
      label: '删除',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect: () => {
        void deleteImageTask(task)
      }
    }
  ]]
}

async function copyRevisedPrompt(text?: string) {
  if (!text) return

  await navigator.clipboard.writeText(text)
  toast.add({
    title: '已复制',
    description: '模型描述已复制到剪贴板',
    icon: 'i-lucide-copy'
  })
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
  void deleteImageAsset(task.id).catch(() => {})

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

function formatTaskCreatedAt(task: ImageTask) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(task.createdAt)
}

function createImageTask(input: {
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  quality: ImageQuality
  size: string
  type: ImageTaskType
  parentId?: string
  sourceImageIds?: string[]
}) {
  return {
    id: createImageTaskId(),
    type: input.type,
    parentId: input.parentId,
    sourceImageIds: input.sourceImageIds,
    prompt: input.prompt,
    ratio: input.ratio,
    resolution: input.resolution,
    quality: input.quality,
    size: input.size,
    model: imageGroup.model,
    groupId: imageGroup.id,
    status: 'generating' as const,
    createdAt: new Date()
  } satisfies ImageTask
}

async function requestImageGenerationJob(apiKey: string, task: ImageTask) {
  const job = await createImageGenerationJob(apiKey, task)
  updateTask(task.id, { jobId: job.id })
  return pollImageGenerationJob(job.id)
}

async function resumeImageGenerationTask(task: ImageTask) {
  if (!task.jobId || task.status !== 'generating') return

  try {
    const result = await pollImageGenerationJob(task.jobId)
    const image = result.data?.[0]
    if (!image?.b64_json && !image?.url) {
      throw new Error('图片接口未返回图片数据')
    }

    const imageUrl = toImageUrl(image)
    updateTask(task.id, {
      status: 'completed',
      imageUrl,
      revisedPrompt: image.revised_prompt,
      durationSeconds: getDurationSeconds(task.createdAt),
      completedAt: result.completedAt ? new Date(result.completedAt) : new Date()
    })
  } catch (error) {
    if (isUnmounted) return

    updateTask(task.id, {
      status: 'error',
      error: toErrorMessage(error),
      durationSeconds: getDurationSeconds(task.createdAt),
      completedAt: new Date()
    })
  }
}

function resumePendingImageTasks() {
  queue.value
    .filter(task => task.status === 'generating' && task.jobId)
    .forEach((task) => {
      void resumeImageGenerationTask(task)
    })
}

async function executeImageTask(
  task: ImageTask,
  getEditSources: () => Promise<File[]>,
  options: {
    selectOnSuccess?: boolean
    shouldClearUploadedImages?: () => boolean
  } = {}
) {
  queue.value.unshift(task)

  try {
    let apiKey = await getApiKeyForGroup(imageGroup.id, imageApiKeyName)
    const editSources = await getEditSources()

    let result: ImageGenerationResponse
    try {
      result = editSources.length
        ? await requestImageEdit(apiKey, task, editSources)
        : await requestImageGenerationJob(apiKey, task)
    } catch (error) {
      const status = (error as RequestError).status
      if (status !== 401 && status !== 403) {
        throw error
      }

      clearApiKeyForGroup(imageGroup.id)
      apiKey = await getApiKeyForGroup(imageGroup.id, imageApiKeyName)
      result = editSources.length
        ? await requestImageEdit(apiKey, task, editSources)
        : await requestImageGenerationJob(apiKey, task)
    }

    const image = result.data?.[0]
    if (!image?.b64_json && !image?.url) {
      throw new Error('图片接口未返回图片数据')
    }

    const imageUrl = toImageUrl(image)
    updateTask(task.id, {
      status: 'completed' as const,
      imageUrl,
      revisedPrompt: image.revised_prompt,
      durationSeconds: getDurationSeconds(task.createdAt),
      completedAt: new Date()
    })
    if (options.selectOnSuccess) {
      selectedTaskId.value = task.id
    }
    if (options.shouldClearUploadedImages?.()) {
      clearUploadedImages()
    }
  } catch (error) {
    if (isUnmounted) return

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

async function getSourcesFromTaskIds(sourceIds: string[]) {
  const sourceTasks = sourceIds
    .map(id => getTaskById(id))
    .filter((task): task is ImageTask => Boolean(task?.imageUrl))

  if (!sourceTasks.length) {
    throw new Error('找不到要编辑的图片，请重新选择图片后再试')
  }

  return Promise.all(sourceTasks.map(task => imageUrlToFile(task.imageUrl!, `source-${task.id}.png`)))
}

async function submitImageTask() {
  if (!canSubmit.value) return
  const uploadedSources = files.value.map(item => item.file)
  const sourceTask = uploadedSources.length ? null : selectedTask.value
  const sourceImageIds = sourceTask ? [sourceTask.id] : undefined

  const task = createImageTask({
    type: sourceTask || uploadedSources.length ? 'edit' : 'generation',
    parentId: sourceTask?.id,
    sourceImageIds,
    prompt: prompt.value.trim(),
    ratio: ratio.value,
    resolution: resolution.value,
    quality: quality.value,
    size: imageSize.value
  })
  if (uploadedSources.length) {
    sourceFilesByTaskId.set(task.id, uploadedSources)
  }
  prompt.value = ''

  await executeImageTask(
    task,
    async () => {
      if (uploadedSources.length) return uploadedSources
      if (sourceImageIds?.length) return getSourcesFromTaskIds(sourceImageIds)
      return []
    },
    {
      selectOnSuccess: Boolean(sourceTask),
      shouldClearUploadedImages: () => uploadedSources.length > 0
    }
  )
}

async function retryImageTask(task: ImageTask) {
  if (task.status === 'generating') return

  const sourceImageIds = task.sourceImageIds?.length
    ? task.sourceImageIds
    : task.parentId ? [task.parentId] : undefined
  let usedUploadedSources = false
  const cachedSources = sourceFilesByTaskId.get(task.id) || []

  const retryTask = createImageTask({
    type: task.type,
    parentId: task.parentId,
    sourceImageIds,
    prompt: task.prompt,
    ratio: task.ratio,
    resolution: task.resolution,
    quality: task.quality,
    size: task.size
  })
  if (cachedSources.length) {
    sourceFilesByTaskId.set(retryTask.id, cachedSources)
  }

  await executeImageTask(
    retryTask,
    async () => {
      if (task.type !== 'edit') return []
      if (sourceImageIds?.length) return getSourcesFromTaskIds(sourceImageIds)
      if (cachedSources.length) return cachedSources
      if (files.value.length) {
        usedUploadedSources = true
        return files.value.map(item => item.file)
      }
      throw new Error('找不到要编辑的图片，请重新上传或选择图片后再试')
    },
    {
      selectOnSuccess: task.type === 'edit',
      shouldClearUploadedImages: () => usedUploadedSources
    }
  )
}
</script>

<template>
  <div class="hero-shell flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
    <div class="relative grid min-h-full gap-5 p-4 pt-0 lg:h-full lg:min-h-0 lg:grid-cols-[1fr_minmax(360px,460px)] lg:p-6 lg:pt-0">
      <section class="hero-panel flex min-h-0 flex-col p-4 sm:p-6 lg:overflow-hidden">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-highlighted">
              图片队列
            </h1>
            <p class="mt-2 text-sm text-muted">
              左侧保存生成结果，选中图片后可在右侧继续编辑。
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <template v-if="batchMode">
              <UButton
                type="button"
                icon="i-lucide-check-check"
                label="全选"
                color="neutral"
                variant="soft"
                size="sm"
                class="rounded-full"
                :disabled="!downloadableTasks.length"
                @click="selectAllBatchTasks"
              />
              <UButton
                type="button"
                label="取消"
                color="neutral"
                variant="ghost"
                size="sm"
                class="warm-pill rounded-full"
                @click="toggleBatchMode"
              />
              <UButton
                type="button"
                icon="i-lucide-download"
                :label="`下载 ${selectedBatchTasks.length}`"
                color="neutral"
                variant="outline"
                size="sm"
                class="warm-pill rounded-full"
                :disabled="!selectedBatchTasks.length"
                @click="downloadSelectedImages"
              />
              <UButton
                type="button"
                icon="i-lucide-trash"
                :label="`删除 ${selectedBatchTasks.length}`"
                color="error"
                variant="soft"
                size="sm"
                class="rounded-full"
                :disabled="!selectedBatchTasks.length"
                @click="deleteSelectedImages"
              />
            </template>
            <template v-else>
              <UButton
                type="button"
                icon="i-lucide-list-checks"
                label="批量"
                color="neutral"
                variant="outline"
                size="sm"
                class="warm-pill rounded-full"
                :disabled="!downloadableTasks.length"
                @click="toggleBatchMode"
              />
              <UBadge
                :label="queue.length ? `${queue.length} 个任务` : '等待提交'"
                color="neutral"
                variant="outline"
                size="lg"
                class="warm-pill rounded-full"
              />
            </template>
          </div>
        </div>

        <div
          v-if="!queue.length"
          class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
        >
          <div class="hero-orb flex size-24 items-center justify-center rounded-[2rem] text-white">
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
          class="mt-5 min-h-0 flex-1 pr-0 lg:mt-8 lg:overflow-y-auto lg:pr-1"
        >
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="item in queue"
              :key="item.id"
              class="warm-card-hover cursor-pointer p-3.5"
              :class="[
                selectedTaskId === item.id ? '!border-[var(--warm-accent)] ring-2 ring-[var(--warm-accent)]/20' : '',
                selectedBatchIds.includes(item.id) ? '!border-[var(--warm-accent)] ring-2 ring-[var(--warm-accent)]/30' : ''
              ]"
              @click="batchMode ? toggleBatchTask(item) : selectImageTask(item)"
            >
              <div class="group relative flex aspect-square items-center justify-center overflow-hidden rounded-[1.35rem] bg-slate-100/70 text-muted shadow-inner dark:bg-white/10">
                <button
                  v-if="batchMode && item.imageUrl"
                  type="button"
                  class="absolute left-3 top-3 z-20 flex size-8 items-center justify-center rounded-full border border-white/70 bg-black/35 text-white shadow-sm backdrop-blur transition"
                  :class="selectedBatchIds.includes(item.id) ? '!bg-[var(--warm-accent)]' : ''"
                  aria-label="Select image"
                  @click.stop="toggleBatchTask(item)"
                >
                  <UIcon
                    :name="selectedBatchIds.includes(item.id) ? 'i-lucide-check' : 'i-lucide-circle'"
                    class="size-4"
                  />
                </button>
                <UBadge
                  v-if="selectedTaskId === item.id && !batchMode"
                  label="正在编辑"
                  color="primary"
                  variant="solid"
                  class="absolute left-3 top-3 z-10 rounded-full"
                />
                <div
                  v-if="item.status === 'error'"
                  class="absolute right-3 top-3 z-10 flex gap-2"
                >
                  <UButton
                    type="button"
                    icon="i-lucide-refresh-cw"
                    color="neutral"
                    variant="solid"
                    size="sm"
                    class="rounded-full"
                    aria-label="Retry failed image"
                    @click.stop="retryImageTask(item)"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-trash"
                    color="error"
                    variant="solid"
                    size="sm"
                    class="rounded-full"
                    aria-label="Delete failed image"
                    @click.stop="deleteImageTask(item)"
                  />
                </div>
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.revisedPrompt || item.prompt"
                  class="size-full object-cover"
                >
                <div
                  v-if="item.imageUrl && !batchMode"
                  class="absolute right-3 top-3 z-10 flex gap-2"
                  @click.stop
                >
                  <UButton
                    type="button"
                    icon="i-lucide-eye"
                    color="neutral"
                    variant="solid"
                    size="sm"
                    class="warm-pill rounded-full"
                    aria-label="Preview image"
                    @click.stop="previewImage(item)"
                  />
                  <UDropdownMenu
                    :items="getImageActionItems(item)"
                    :content="{ align: 'end', collisionPadding: 12 }"
                  >
                    <UButton
                      type="button"
                      icon="i-lucide-more-horizontal"
                      color="neutral"
                      variant="solid"
                      size="sm"
                      class="warm-pill rounded-full"
                      aria-label="More image actions"
                    />
                  </UDropdownMenu>
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
                class="mt-3 flex items-center gap-2 rounded-2xl border border-[var(--warm-border)] bg-[var(--warm-surface-hover)] px-2.5 py-2"
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
                  <span class="shrink-0 text-xs text-muted">
                    {{ formatTaskCreatedAt(item) }}
                  </span>
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
                {{ normalizeApiErrorMessage(item.error) }}
              </p>
              <div
                v-if="item.revisedPrompt"
                class="mt-3 rounded-2xl border border-[var(--warm-border)] bg-[var(--warm-surface-hover)] px-3 py-2"
              >
                <div class="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <UIcon
                    name="i-lucide-sparkles"
                    class="size-3.5 text-amber-500"
                  />
                  <span>模型描述</span>
                </div>
                <p class="line-clamp-2 text-xs leading-5 text-muted">
                  {{ item.revisedPrompt }}
                </p>
              </div>
              <p class="mt-3 line-clamp-3 text-sm text-muted">
                {{ item.prompt }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section class="hero-panel flex min-h-0 flex-col lg:h-full">
        <div class="warm-divider border-b p-4 sm:p-5">
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
              class="warm-pill shrink-0 rounded-full"
              @click="clearSelectedTask"
            />
          </div>
        </div>

        <div
          class="min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-4 text-center sm:px-6 sm:py-6"
          :class="selectedTask ? 'flex' : 'hidden lg:flex'"
        >
          <div v-if="!selectedTask">
            <div class="hero-orb mx-auto flex size-16 items-center justify-center rounded-2xl text-white">
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
            <div class="warm-card rounded-3xl p-3">
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
                  <p
                    v-if="selectedTask.revisedPrompt"
                    class="mt-1 line-clamp-2 text-xs leading-5 text-muted"
                  >
                    模型描述：{{ selectedTask.revisedPrompt }}
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
                  class="warm-pill rounded-full"
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
                class="warm-card-hover rounded-3xl p-3"
                :class="selectedTaskId === historyItem.id ? 'ring-2 ring-[var(--warm-accent)]/20' : ''"
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
                      v-if="historyItem.revisedPrompt"
                      class="mt-1 line-clamp-2 text-xs leading-5 text-muted"
                    >
                      模型描述：{{ historyItem.revisedPrompt }}
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
                        class="warm-pill rounded-full"
                        @click="reusePrompt(historyItem)"
                      />
                      <UButton
                        v-if="historyItem.imageUrl"
                        type="button"
                        :label="selectedTaskId === historyItem.id ? '当前图片' : '设为当前'"
                        color="neutral"
                        variant="soft"
                        size="xs"
                        class="warm-pill rounded-full"
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
          class="warm-divider border-t p-3 sm:p-4"
          @submit.prevent="submitImageTask"
        >
          <div class="mb-3 flex flex-wrap justify-center gap-2">
            <button
              v-for="preset in imagePromptPresets"
              :key="preset.label"
              type="button"
              class="warm-pill inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold"
              @click="useImagePromptPreset(preset.prompt)"
            >
              <UIcon
                :name="preset.icon"
                class="size-3.5"
                :class="preset.color"
              />
              {{ preset.label }}
            </button>
          </div>

          <div
            class="warm-input relative p-4"
            :class="isDraggingImages ? 'ring-2 ring-[var(--warm-accent)]/35' : ''"
            @paste="onPasteImages"
            @dragover="onDragOverImages"
            @dragleave="onDragLeaveImages"
            @drop="onDropImages"
          >
            <div
              v-if="isDraggingImages"
              class="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border border-dashed border-[var(--warm-accent)] bg-white/80 text-sm font-medium text-highlighted backdrop-blur dark:bg-black/50"
            >
              松开后加入参考图，用于以图生图
            </div>
            <div
              v-if="files.length"
              class="mb-3 flex gap-2 overflow-x-auto pb-1"
            >
              <div
                v-for="file in files"
                :key="file.id"
                class="warm-card-hover group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl"
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
                  color="primary"
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
              class="w-full"
              :ui="{ root: 'w-full', base: 'w-full max-h-48 resize-none overflow-y-auto text-base leading-7' }"
            />

            <div class="mt-2 flex flex-col gap-3 warm-divider border-t pt-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-nowrap sm:overflow-x-auto [&::-webkit-scrollbar]:hidden">
                <UPopover>
                  <UButton
                    type="button"
                    icon="i-lucide-sliders-horizontal"
                    color="neutral"
                    variant="outline"
                    :label="`${resolution} · ${ratio}`"
                    size="sm"
                    class="warm-pill shrink-0 rounded-full text-sm"
                    :ui="{ leadingIcon: 'size-3.5' }"
                  />

                  <template #content>
                    <div class="hero-panel w-[360px] max-w-[calc(100vw-2rem)] space-y-5 rounded-3xl p-4">
                      <div>
                        <h3 class="text-base font-bold text-highlighted">
                          生图参数
                        </h3>
                        <p class="mt-1 text-sm text-muted">
                          调整生成图片的画幅比例与清晰度。
                        </p>
                      </div>

                      <div class="space-y-2.5">
                        <div class="text-sm font-semibold text-muted">
                          画面比例
                        </div>
                        <div class="grid grid-cols-3 gap-2.5">
                          <button
                            v-for="item in ratioOptions"
                            :key="item.value"
                            type="button"
                            class="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 text-center text-sm font-medium transition"
                            :class="ratio === item.value ? 'warm-btn' : 'text-highlighted hover:bg-[var(--warm-surface-hover)]'"
                            @click="ratio = item.value"
                          >
                            <span
                              class="flex h-8 w-12 items-center justify-center"
                              aria-hidden="true"
                            >
                              <span
                                class="flex max-h-8 max-w-12 items-center justify-center rounded-sm border-2"
                                :class="ratio === item.value ? 'border-current bg-[var(--warm-accent-soft)]' : 'border-zinc-300 bg-[var(--warm-surface-hover)]'"
                                :style="{ aspectRatio: item.aspect, width: item.aspect.includes(' / 16') || item.aspect.includes(' / 4') ? '1.5rem' : '3rem' }"
                              >
                                <UIcon
                                  v-if="item.auto"
                                  name="i-lucide-sparkles"
                                  class="size-4"
                                />
                              </span>
                            </span>
                            <span>{{ item.value }}</span>
                          </button>
                        </div>
                      </div>

                      <div class="space-y-2.5">
                        <div class="text-sm font-semibold text-muted">
                          分辨率
                        </div>
                        <div class="grid grid-cols-3 gap-2.5">
                          <button
                            v-for="item in resolutionItems"
                            :key="item"
                            type="button"
                            class="rounded-xl px-3 py-2.5 text-center text-base font-bold transition"
                            :class="resolution === item ? 'warm-btn' : 'text-highlighted hover:bg-[var(--warm-surface-hover)]'"
                            @click="resolution = item"
                          >
                            {{ item }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </template>
                </UPopover>

                <div class="hidden h-6 w-px bg-[var(--warm-border)] sm:block" />

                <UButton
                  type="button"
                  icon="i-lucide-zap"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :label="imageGroup.label"
                  class="warm-pill shrink-0 rounded-full text-sm font-semibold"
                  :ui="{ leadingIcon: 'size-3.5' }"
                />

                <UPopover>
                  <UButton
                    type="button"
                    :icon="activeQualityIcon"
                    color="neutral"
                    variant="outline"
                    :label="`质量: ${getImageQualityLabel(quality)}`"
                    size="sm"
                    class="warm-pill shrink-0 rounded-full text-sm"
                    :ui="{ leadingIcon: 'size-3.5' }"
                  />

                  <template #content>
                    <div class="hero-panel w-48 rounded-2xl p-1.5">
                      <UButton
                        v-for="item in imageQualityItems"
                        :key="item.value"
                        type="button"
                        :icon="item.icon"
                        :label="item.label"
                        color="neutral"
                        :variant="quality === item.value ? 'soft' : 'ghost'"
                        block
                        class="justify-start rounded-lg font-medium"
                        @click="quality = item.value"
                      />
                    </div>
                  </template>
                </UPopover>

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
                  variant="soft"
                  size="sm"
                  :label="files.length ? `${files.length}/${uploadedImageLimit}` : undefined"
                  class="warm-pill shrink-0 rounded-full text-sm font-semibold"
                  :disabled="files.length >= uploadedImageLimit"
                  :ui="{ leadingIcon: 'size-3.5' }"
                  @click="pickFiles"
                />
              </div>

              <div class="flex w-full shrink-0 items-center justify-end gap-3">
                <span class="inline-flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-coins" class="size-3" />{{ estimatedCost }}</span>
                <UButton
                  type="submit"
                  icon="i-lucide-arrow-up"
                  color="primary"
                  :disabled="!canSubmit"
                  :aria-label="submitLabel"
                  class="warm-btn shrink-0"
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
      <div class="hero-panel relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] shadow-2xl">
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
          class="max-h-[72vh] w-full bg-black object-contain"
        >
        <div
          v-if="previewTask"
          class="flex flex-wrap items-center justify-between gap-3 border-t border-default p-4 text-left"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-highlighted">
              {{ getTaskNumber(previewTask) || '预览图片' }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ previewTask.resolution }} · {{ previewTask.ratio }} · {{ previewTask.size }}
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              type="button"
              icon="i-lucide-pencil"
              label="设为当前"
              color="neutral"
              variant="soft"
              size="sm"
              class="rounded-full"
              :disabled="selectedTaskId === previewTask.id"
              @click="setCurrentTask(previewTask)"
            />
            <UButton
              type="button"
              icon="i-lucide-paperclip"
              label="加入参考图"
              color="neutral"
              variant="soft"
              size="sm"
              class="warm-pill rounded-full"
              @click="addTaskImageAsReference(previewTask)"
            />
            <UButton
              type="button"
              icon="i-lucide-copy"
              label="复制图片"
              color="neutral"
              variant="soft"
              size="sm"
              class="warm-pill rounded-full"
              @click="copyImage(previewTask)"
            />
            <UButton
              type="button"
              icon="i-lucide-download"
              label="下载"
              color="neutral"
              variant="soft"
              size="sm"
              class="warm-pill rounded-full"
              @click="downloadImage(previewTask)"
            />
            <UButton
              type="button"
              icon="i-lucide-trash"
              label="删除"
              color="error"
              variant="soft"
              size="sm"
              class="rounded-full"
              @click="deleteImageTask(previewTask)"
            />
          </div>
        </div>
        <div
          v-if="previewRevisedPrompt"
          class="border-t border-default p-4 text-left"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon
                name="i-lucide-sparkles"
                class="size-4 text-amber-500"
              />
              <span>模型描述</span>
            </div>
            <UButton
              type="button"
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              size="xs"
              class="warm-pill rounded-full"
              aria-label="Copy revised prompt"
              @click="copyRevisedPrompt(previewRevisedPrompt)"
            />
          </div>
          <p class="max-h-32 overflow-y-auto text-sm leading-6 text-muted">
            {{ previewRevisedPrompt }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
