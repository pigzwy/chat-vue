import { computed, ref, watch } from 'vue'
import { createSharedComposable, useStorage } from '@vueuse/core'
import ModalConfirm from '../../components/ModalConfirm.vue'
import { useModels } from '../useModels'
import { useMediaModels } from './useMediaModels'
import {
  createImageEditJob,
  createImageGenerationJob,
  parseJson,
  pollImageGenerationJob,
  type GeneratedMediaPayload,
  type MediaJobResponse
} from './useImageGeneration'
import { createVideoGenerationJob, pollVideoGenerationJob } from './useVideoGeneration'
import {
  defaultImageQuality,
  imageQualities,
  imageRatios,
  imageResolutions,
  imageSizeMap,
  type ImageQuality,
  type ImageRatio,
  type ImageResolution
} from '../../../shared/utils/images'
import {
  defaultVideoResolution,
  mediaApiKeyName,
  resolveMediaModelSpec,
  type MediaKind,
  type VideoResolution
} from '../../../shared/utils/mediaModels'
import type { RequestError } from '../../../shared/utils/errors'

export type MediaTaskType = 'generation' | 'edit'
export type MediaTaskStatus = 'generating' | 'completed' | 'error'

export interface MediaTask {
  id: string
  kind: MediaKind
  type: MediaTaskType
  parentId?: string
  sourceImageIds?: string[]
  prompt: string
  model: string
  groupId: number
  status: MediaTaskStatus
  ratio?: ImageRatio
  resolution?: ImageResolution
  quality?: ImageQuality
  size?: string
  imageUrl?: string
  /** 视频时长参数（秒） */
  duration?: number
  /** 视频分辨率参数（480p/720p） */
  videoResolution?: VideoResolution
  videoUrl?: string
  revisedPrompt?: string
  error?: string
  /** 实际生成耗时（秒） */
  durationSeconds?: number
  /** 本次实际扣费（美元，来自上游账单） */
  costUsd?: number
  jobId?: string
  mode?: 'stream' | 'sync'
  streamAttempts?: number
  completedAt?: Date
  createdAt: Date
}

interface StoredMediaTask extends Omit<MediaTask, 'createdAt' | 'completedAt'> {
  createdAt: string
  completedAt?: string
}

export interface UploadedImage {
  id: string
  file: File
  previewUrl: string
  name: string
  size: number
  type: string
}

const mediaStorageKey = 'sub2api-media-tasks'
const legacyImageStorageKey = 'sub2api-image-tasks'
const imageQualityStorageKey = 'sub2api-image-quality'
const imageDatabaseName = 'sub2api-image-assets'
const imageDatabaseStoreName = 'images'
const perKindStorageLimit = 12
export const uploadedImageLimit = 8
export const videoSourceImageLimit = 1
export const promptLimit = 5000

function isImageRatio(value: unknown): value is ImageRatio {
  return typeof value === 'string' && (imageRatios as readonly string[]).includes(value)
}

function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === 'string' && (imageResolutions as readonly string[]).includes(value)
}

function isImageQuality(value: unknown): value is ImageQuality {
  return typeof value === 'string' && (imageQualities as readonly string[]).includes(value)
}

function loadStoredImageQuality(): ImageQuality {
  if (typeof window === 'undefined') return defaultImageQuality

  const value = window.localStorage.getItem(imageQualityStorageKey)
  return isImageQuality(value) ? value : defaultImageQuality
}

function createMediaTaskId() {
  return crypto.randomUUID()
}

// useOverlay().create 会向全局 overlays 数组追加且不随 scope 销毁回收，
// 模块级复用同一个确认弹窗，避免反复进出创作台时条目泄漏
let deleteConfirmModalHandle: { open: () => { result: Promise<unknown> } } | null = null

export const useStudioTasks = createSharedComposable(() => {
  const toast = useToast()
  const overlay = useOverlay()
  const { getApiKeyForGroup, clearApiKeyForGroup } = useModels()
  const mediaModels = useMediaModels()

  deleteConfirmModalHandle ||= overlay.create(ModalConfirm, {
    props: {
      title: '删除记录',
      description: '确定要删除这条生成记录吗？此操作只会从当前浏览器历史中移除。'
    }
  })
  const deleteConfirmModal = deleteConfirmModalHandle

  async function confirmDelete() {
    const instance = deleteConfirmModal.open()
    return Boolean(await instance.result)
  }

  const prompt = ref('')
  const ratio = useStorage<ImageRatio>('sub2api-media-ratio', '16:9')
  const resolution = useStorage<ImageResolution>('sub2api-media-resolution', '2K')
  const quality = ref<ImageQuality>(loadStoredImageQuality())
  const videoDuration = useStorage<number>('sub2api-media-video-duration', 10)
  const videoResolution = useStorage<VideoResolution>('sub2api-media-video-resolution', defaultVideoResolution)
  const files = ref<UploadedImage[]>([])
  const queue = ref<MediaTask[]>(loadStoredTasks())
  const previewTask = ref<MediaTask | null>(null)
  const previewUploadedImage = ref<UploadedImage | null>(null)
  const selectedTaskId = ref('')
  const batchMode = ref(false)
  const selectedBatchIds = ref<string[]>([])
  const isDraggingImages = ref(false)
  const historyPanelOpen = ref(false)
  const timerNow = ref(Date.now())
  let durationTimer: ReturnType<typeof setInterval> | null = null
  let imageDatabasePromise: Promise<IDBDatabase> | null = null
  let isUnmounted = false
  const sourceFilesByTaskId = new Map<string, File[]>()

  const isVideoMode = computed(() => mediaModels.mediaMode.value === 'video')
  const currentUploadLimit = computed(() => isVideoMode.value ? videoSourceImageLimit : uploadedImageLimit)
  const canSubmit = computed(() => prompt.value.trim().length > 0)
  const hasUploadedImages = computed(() => files.value.length > 0)
  const imageSize = computed(() => imageSizeMap[resolution.value][ratio.value])
  const estimatedCost = computed(() => {
    if (isVideoMode.value) {
      const rate = resolveMediaModelSpec(mediaModels.videoModel.value).costPerSecondByResolution?.[videoResolution.value]
      return rate ? rate * videoDuration.value : undefined
    }
    const spec = resolveMediaModelSpec(mediaModels.imageModel.value)
    if (spec.costPerImage) return spec.costPerImage
    return spec.costByResolution?.[resolution.value]
  })
  const imageTasks = computed(() => queue.value.filter(task => task.kind === 'image'))
  const videoTasks = computed(() => queue.value.filter(task => task.kind === 'video'))
  const selectedTask = computed(() => {
    return queue.value.find(item => item.id === selectedTaskId.value && item.imageUrl) || null
  })
  const downloadableTasks = computed(() => queue.value.filter(item => item.imageUrl || item.videoUrl))
  const selectedBatchTasks = computed(() => {
    const selected = new Set(selectedBatchIds.value)
    return queue.value.filter(item => selected.has(item.id) && (item.imageUrl || item.videoUrl))
  })
  const selectedHistory = computed(() => {
    if (!selectedTask.value) return []

    const byId = new Map(queue.value.map(item => [item.id, item]))
    const history: MediaTask[] = []
    let current: MediaTask | undefined = selectedTask.value
    while (current) {
      history.unshift(current)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return history
  })

  const previewImageUrl = computed(() => previewTask.value?.imageUrl || previewUploadedImage.value?.previewUrl || '')
  const previewVideoUrl = computed(() => previewTask.value?.videoUrl || '')
  const previewRevisedPrompt = computed(() => previewTask.value?.revisedPrompt?.trim() || '')

  const submitLabel = computed(() => {
    if (isVideoMode.value) {
      return hasUploadedImages.value || selectedTask.value ? '图生视频' : '生成视频'
    }
    if (hasUploadedImages.value) return '编辑上传图片'
    return selectedTask.value ? '编辑所选图片' : '生成图片'
  })
  const promptPlaceholder = computed(() => {
    if (isVideoMode.value) {
      if (hasUploadedImages.value || selectedTask.value) return '描述画面如何动起来、镜头怎么运动...'
      return '描述你想生成的视频画面、动作和镜头...'
    }
    if (hasUploadedImages.value) return '描述你想怎么编辑上传的图片...'
    return selectedTask.value ? '描述你想怎么编辑这张图片...' : '描述你想生成的图片，也可以上传或拖拽图片以图生图...'
  })

  // ---------------------------------------------------------------------------
  // 持久化：localStorage 存元数据（图片/视频各限 12 条），IndexedDB 存图片 base64
  // ---------------------------------------------------------------------------

  function toStoredTask(task: MediaTask): StoredMediaTask {
    return {
      ...task,
      imageUrl: task.imageUrl?.startsWith('data:') ? undefined : task.imageUrl,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString()
    }
  }

  function normalizeStoredTaskId(id: string | undefined, usedIds: Set<string>) {
    if (id && !usedIds.has(id)) {
      usedIds.add(id)
      return id
    }

    const nextId = createMediaTaskId()
    usedIds.add(nextId)
    return nextId
  }

  function fromStoredTask(task: StoredMediaTask, usedIds: Set<string>): MediaTask | null {
    const kind: MediaKind = task.kind === 'video' ? 'video' : 'image'
    if (kind === 'image' && (!isImageRatio(task.ratio) || !isImageResolution(task.resolution))) return null
    if (!task.prompt || !task.createdAt) return null

    return {
      ...task,
      kind,
      id: normalizeStoredTaskId(task.id, usedIds),
      type: task.type === 'edit' ? 'edit' : 'generation',
      status: task.status === 'generating' && !task.jobId ? 'error' : task.status,
      error: task.status === 'generating' && !task.jobId ? '刷新中断了生成任务，请重试' : task.error,
      quality: isImageQuality(task.quality) ? task.quality : (kind === 'image' ? defaultImageQuality : undefined),
      completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      createdAt: new Date(task.createdAt)
    }
  }

  function parseStoredTasks(text: string | null) {
    if (!text) return []

    const parsed = parseJson<StoredMediaTask[]>(text)
    if (!Array.isArray(parsed)) return []

    const usedIds = new Set<string>()
    return parsed
      .map(task => fromStoredTask(task, usedIds))
      .filter((task): task is MediaTask => Boolean(task))
  }

  function loadStoredTasks() {
    if (typeof window === 'undefined') return []

    const current = window.localStorage.getItem(mediaStorageKey)
    if (current) return parseStoredTasks(current)

    // 旧版数据迁移：sub2api-image-tasks → sub2api-media-tasks（旧 key 保留，便于回滚）。
    // 旧数据没有 kind 字段，fromStoredTask 会默认归为 image。
    return parseStoredTasks(window.localStorage.getItem(legacyImageStorageKey))
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

  async function persistImageAssets(tasks: MediaTask[]) {
    try {
      await Promise.all(tasks.map(task => task.imageUrl ? putImageAsset(task.id, task.imageUrl) : undefined))
      await deleteImageAssetsExcept(new Set(tasks.map(task => task.id)))
    } catch {
      // Keep metadata persistence independent from large image asset persistence.
    }
  }

  async function hydrateStoredImageAssets() {
    // 按 id 合并回当前队列而不是整体替换：hydrate 期间恢复轮询可能已把任务写成
    // completed，整体替换会用旧快照把它回滚成 generating（且不再有人更新）
    const snapshots = [...queue.value]
    await Promise.all(snapshots.map(async (task) => {
      if (task.imageUrl?.startsWith('data:')) {
        await putImageAsset(task.id, task.imageUrl)
        return
      }
      if (task.kind === 'video' || task.imageUrl) return

      const imageUrl = await getImageAsset(task.id)
      if (!imageUrl) return

      const index = queue.value.findIndex(item => item.id === task.id)
      const current = queue.value[index]
      if (index !== -1 && current && !current.imageUrl) {
        queue.value.splice(index, 1, { ...current, imageUrl })
      }
    }))

    persistTasks(queue.value)
  }

  function limitTasksForStorage(tasks: MediaTask[]) {
    // 生成中的任务优先保留：被截断会丢 jobId，刷新后无法恢复（服务端仍在跑并扣费）
    const keep = new Set<MediaTask>()
    const counts: Record<MediaKind, number> = { image: 0, video: 0 }

    for (const task of tasks) {
      if (task.status !== 'generating') continue
      keep.add(task)
      counts[task.kind]++
    }
    for (const task of tasks) {
      if (keep.has(task)) continue
      if (counts[task.kind] >= perKindStorageLimit) continue
      keep.add(task)
      counts[task.kind]++
    }

    return tasks.filter(task => keep.has(task))
  }

  function persistTasks(tasks: MediaTask[]) {
    if (typeof window === 'undefined') return

    const next = limitTasksForStorage(tasks)
    void persistImageAssets(next)

    try {
      window.localStorage.setItem(mediaStorageKey, JSON.stringify(next.map(toStoredTask)))
    } catch {
      try {
        window.localStorage.setItem(mediaStorageKey, JSON.stringify(next.map(task => ({
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

  // 切到视频模式时源图上限降为 1，超出部分裁剪
  watch(isVideoMode, (video) => {
    if (video && files.value.length > videoSourceImageLimit) {
      files.value.slice(videoSourceImageLimit).forEach(revokeUploadedImage)
      files.value = files.value.slice(0, videoSourceImageLimit)
      toast.add({
        description: '视频模式最多使用 1 张源图，已保留第一张',
        icon: 'i-lucide-circle-alert',
        color: 'warning'
      })
    }
  })

  // ---------------------------------------------------------------------------
  // 上传源图
  // ---------------------------------------------------------------------------

  function createUploadedImage(file: File): UploadedImage {
    return {
      id: createMediaTaskId(),
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      type: file.type
    }
  }

  function createUploadedImageFromFile(file: File, previewUrl: string): UploadedImage {
    return {
      id: createMediaTaskId(),
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

  function getImageFiles(filesLike: FileList | File[]) {
    // 部分手机拍摄/分享的文件 type 为空，也放进来尝试转码
    return Array.from(filesLike).filter(file => file.type.startsWith('image/') || file.type === '')
  }

  const supportedSourceTypes = ['image/png', 'image/jpeg', 'image/webp']
  const normalizedMaxDimension = 2560

  // 手机相册常见 HEIC 等服务端不收的格式：浏览器能解码就转成 JPEG（顺带压尺寸）
  async function normalizeSourceImage(file: File): Promise<File> {
    if (supportedSourceTypes.includes(file.type)) return file

    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('decode failed'))
        el.src = objectUrl
      })
      const scale = Math.min(1, normalizedMaxDimension / Math.max(image.naturalWidth, image.naturalHeight, 1))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) return file
      return new File([blob], `${file.name.replace(/\.[^.]*$/, '') || 'image'}.jpg`, { type: 'image/jpeg' })
    } catch {
      // 解码失败原样提交，由服务端返回明确的格式错误
      return file
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  async function appendUploadedImages(imageFiles: File[]) {
    const limit = currentUploadLimit.value
    const remaining = limit - files.value.length
    if (remaining <= 0) {
      toast.add({
        description: `最多上传 ${limit} 张图片`,
        icon: 'i-lucide-circle-alert',
        color: 'warning'
      })
      return
    }

    const accepted = await Promise.all(imageFiles.slice(0, remaining).map(normalizeSourceImage))
    files.value = [...files.value, ...accepted.map(createUploadedImage)]
    if (imageFiles.length > remaining) {
      toast.add({
        description: `最多上传 ${limit} 张图片，已自动保留前 ${remaining} 张`,
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

  // dragenter/dragleave 成对计数：拖过子元素时两者都会触发，
  // 只按 currentTarget 判断会让"拖出窗口"漏掉复位，遮罩永久残留
  let dragDepth = 0

  function hasDraggedImage(event: DragEvent) {
    return Array.from(event.dataTransfer?.items || []).some(item => item.type.startsWith('image/'))
  }

  function onDragEnterImages(event: DragEvent) {
    if (!hasDraggedImage(event)) return

    event.preventDefault()
    dragDepth++
    isDraggingImages.value = true
  }

  function onDragOverImages(event: DragEvent) {
    if (!hasDraggedImage(event)) return
    event.preventDefault()
  }

  function onDragLeaveImages() {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) {
      isDraggingImages.value = false
    }
  }

  function onDropImages(event: DragEvent) {
    dragDepth = 0
    isDraggingImages.value = false

    const imageFiles = getImageFiles(event.dataTransfer?.files || [])
    if (!imageFiles.length) return

    event.preventDefault()
    void appendUploadedImages(imageFiles)
  }

  // ---------------------------------------------------------------------------
  // 任务队列
  // ---------------------------------------------------------------------------

  function normalizeApiErrorMessage(message: string) {
    return message.replace(/sub2api/gi, 'API')
  }

  function toErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : ''
    if (!message) return '生成失败'

    try {
      const parsed = JSON.parse(message)
      return normalizeApiErrorMessage(parsed.error?.message || parsed.message || message)
    } catch {
      return normalizeApiErrorMessage(message)
    }
  }

  function updateTask(id: string, patch: Partial<MediaTask>) {
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

  function toImageUrl(image: GeneratedMediaPayload) {
    if (image.url) return image.url
    if (!image.b64_json) return ''
    if (image.b64_json.startsWith('data:')) return image.b64_json
    if (image.mime_type) return `data:${image.mime_type};base64,${image.b64_json}`

    // 上游未标注格式时按 base64 魔数探测（Grok 返回 JPEG，gpt-image 返回 PNG）
    const mime = image.b64_json.startsWith('/9j/')
      ? 'image/jpeg'
      : image.b64_json.startsWith('R0lGOD')
        ? 'image/gif'
        : image.b64_json.startsWith('UklGR')
          ? 'image/webp'
          : 'image/png'
    return `data:${mime};base64,${image.b64_json}`
  }

  function getTaskById(id?: string) {
    if (!id) return null
    return queue.value.find(item => item.id === id) || null
  }

  function getTaskNumber(task?: MediaTask | null) {
    if (!task) return ''

    const index = queue.value.findIndex(item => item.id === task.id)
    if (index === -1) return ''

    return `#${queue.value.length - index}`
  }

  function getDurationSeconds(startedAt: Date) {
    return Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 1000))
  }

  function getTaskDurationSeconds(task: MediaTask) {
    if (task.durationSeconds) return task.durationSeconds
    if (task.status !== 'generating') return 0

    return Math.max(1, Math.round((timerNow.value - task.createdAt.getTime()) / 1000))
  }

  function formatTaskCreatedAt(task: MediaTask) {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(task.createdAt)
  }

  function reusePrompt(task: MediaTask) {
    prompt.value = task.prompt
  }

  function selectMediaTask(task: MediaTask) {
    if (task.kind !== 'image' || !task.imageUrl) return
    selectedTaskId.value = selectedTaskId.value === task.id ? '' : task.id
  }

  function setCurrentTask(task: MediaTask) {
    if (task.kind !== 'image' || !task.imageUrl) return
    selectedTaskId.value = task.id
  }

  function clearSelectedTask() {
    selectedTaskId.value = ''
  }

  function previewMediaTask(task: MediaTask) {
    if (!task.imageUrl && !task.videoUrl) return
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

  function getMediaDownloadFilename(task: Pick<MediaTask, 'id' | 'createdAt' | 'model' | 'kind' | 'imageUrl'>) {
    const createdAt = task.createdAt
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    const extension = task.kind === 'video'
      ? 'mp4'
      : task.imageUrl?.startsWith('data:image/jpeg')
        ? 'jpg'
        : task.imageUrl?.startsWith('data:image/webp')
          ? 'webp'
          : 'png'

    return `${task.model || 'media'}-${createdAt}-${task.id}.${extension}`
  }

  function triggerDownload(href: string, filename: string) {
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function downloadMediaTask(task: MediaTask) {
    const filename = getMediaDownloadFilename(task)

    if (task.videoUrl) {
      // 跨域视频 URL 无法直接 download，先转 blob；404 表示代理已过期，别再开新窗口
      try {
        const response = await fetch(task.videoUrl)
        if (response.status === 404) {
          toast.add({
            description: '视频已过期，无法下载，请重新生成',
            icon: 'i-lucide-circle-alert',
            color: 'warning'
          })
          return
        }
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        triggerDownload(objectUrl, filename)
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
      } catch {
        window.open(task.videoUrl, '_blank', 'noopener')
      }
      return
    }

    if (!task.imageUrl) return
    triggerDownload(task.imageUrl, filename)
  }

  async function imageUrlToFile(imageUrl: string, filename: string) {
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type || 'image/png' })
  }

  async function copyImage(task: MediaTask) {
    if (!task.imageUrl) return

    try {
      const file = await imageUrlToFile(task.imageUrl, getMediaDownloadFilename(task))
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

  async function addTaskImageAsReference(task: MediaTask) {
    if (!task.imageUrl) return

    const limit = currentUploadLimit.value
    const remaining = limit - files.value.length
    if (remaining <= 0) {
      toast.add({
        description: `最多上传 ${limit} 张图片`,
        icon: 'i-lucide-circle-alert',
        color: 'warning'
      })
      return
    }

    try {
      const file = await imageUrlToFile(task.imageUrl, getMediaDownloadFilename(task))
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

  async function copyRevisedPrompt(text?: string) {
    if (!text) return

    await navigator.clipboard.writeText(text)
    toast.add({
      title: '已复制',
      description: '内容已复制到剪贴板',
      icon: 'i-lucide-copy'
    })
  }

  // ---------------------------------------------------------------------------
  // 删除 / 批量
  // ---------------------------------------------------------------------------

  async function deleteMediaTask(task: MediaTask) {
    if (!await confirmDelete()) return

    // 只删除用户点击的这一条。旧 localStorage 数据可能存在重复 id，不能按 id 批量过滤。
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
      title: '已删除',
      description: '已从本地生成历史中移除',
      icon: 'i-lucide-trash'
    })
  }

  function toggleBatchMode() {
    batchMode.value = !batchMode.value
    selectedBatchIds.value = []
  }

  function toggleBatchTask(task: MediaTask) {
    if (!task.imageUrl && !task.videoUrl) return

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

  function downloadSelectedTasks() {
    selectedBatchTasks.value.forEach((task, index) => {
      window.setTimeout(() => {
        void downloadMediaTask(task)
      }, index * 150)
    })
  }

  async function deleteSelectedTasks() {
    if (!selectedBatchTasks.value.length) return
    if (!await confirmDelete()) return

    const selected = new Set(selectedBatchTasks.value.map(task => task.id))
    queue.value = queue.value.filter(task => !selected.has(task.id))
    selected.forEach((id) => {
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
      title: '已删除',
      description: `已删除 ${selected.size} 条生成记录`,
      icon: 'i-lucide-trash'
    })
  }

  // ---------------------------------------------------------------------------
  // 提交 / 重试 / 恢复
  // ---------------------------------------------------------------------------

  function applyCompletedResult(task: MediaTask, result: MediaJobResponse) {
    const payload = result.data?.[0]
    if (task.kind === 'video') {
      if (!payload?.url) {
        throw new Error('视频接口未返回视频地址')
      }
      updateTask(task.id, {
        status: 'completed',
        videoUrl: payload.url,
        revisedPrompt: payload.revised_prompt,
        costUsd: result.costUsd,
        durationSeconds: getDurationSeconds(task.createdAt),
        completedAt: result.completedAt ? new Date(result.completedAt) : new Date()
      })
      persistNow()
      toast.add({
        title: '视频生成完成',
        description: '视频链接约 2 小时内有效，请及时下载保存',
        icon: 'i-lucide-clapperboard'
      })
      return
    }

    if (!payload?.b64_json && !payload?.url) {
      throw new Error('图片接口未返回图片数据')
    }
    updateTask(task.id, {
      status: 'completed',
      imageUrl: toImageUrl(payload),
      revisedPrompt: payload.revised_prompt,
      mode: result.mode,
      streamAttempts: result.streamAttempts,
      costUsd: result.costUsd,
      durationSeconds: getDurationSeconds(task.createdAt),
      completedAt: result.completedAt ? new Date(result.completedAt) : new Date()
    })
    persistNow()
  }

  async function executeMediaTask(
    task: MediaTask,
    runner: (apiKey: string) => Promise<MediaJobResponse>,
    options: {
      selectOnSuccess?: boolean
      /** 成功后只清掉本次提交用掉的源图（生成期间用户可能已上传了新源图） */
      getUploadedIdsToClear?: () => string[]
    } = {}
  ) {
    queue.value.unshift(task)

    try {
      let apiKey = await getApiKeyForGroup(task.groupId, mediaApiKeyName)

      let result: MediaJobResponse
      try {
        result = await runner(apiKey)
      } catch (error) {
        const status = (error as RequestError).status
        if (status !== 401 && status !== 403) {
          throw error
        }

        clearApiKeyForGroup(task.groupId)
        apiKey = await getApiKeyForGroup(task.groupId, mediaApiKeyName)
        result = await runner(apiKey)
      }

      applyCompletedResult(task, result)

      if (options.selectOnSuccess && task.kind === 'image') {
        selectedTaskId.value = task.id
      }
      for (const id of options.getUploadedIdsToClear?.() || []) {
        removeUploadedImage(id)
      }
    } catch (error) {
      if (isUnmounted) return

      const message = toErrorMessage(error)
      updateTask(task.id, {
        status: 'error',
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
      .filter((task): task is MediaTask => Boolean(task?.imageUrl))

    if (!sourceTasks.length) {
      throw new Error('找不到要编辑的图片，请重新选择图片后再试')
    }

    return Promise.all(sourceTasks.map(task => imageUrlToFile(task.imageUrl!, `source-${task.id}.png`)))
  }

  interface CreateTaskInput {
    kind: MediaKind
    type: MediaTaskType
    parentId?: string
    sourceImageIds?: string[]
    prompt: string
  }

  function createMediaTask(input: CreateTaskInput): MediaTask {
    const model = input.kind === 'video' ? mediaModels.videoModel.value : mediaModels.imageModel.value
    const base = {
      id: createMediaTaskId(),
      type: input.type,
      parentId: input.parentId,
      sourceImageIds: input.sourceImageIds,
      prompt: input.prompt,
      model,
      // 分组跟着模型走：GPT Image → 分组 25，Grok 全系 → 分组 66
      groupId: mediaModels.groupForModel(model),
      status: 'generating' as const,
      createdAt: new Date()
    }

    if (input.kind === 'video') {
      return {
        ...base,
        kind: 'video',
        duration: videoDuration.value,
        videoResolution: videoResolution.value
      }
    }

    return {
      ...base,
      kind: 'image',
      ratio: ratio.value,
      resolution: resolution.value,
      quality: quality.value,
      size: imageSize.value
    }
  }

  function imageJobRequest(task: MediaTask) {
    return {
      prompt: task.prompt,
      model: task.model,
      ratio: task.ratio || 'Auto' as ImageRatio,
      resolution: task.resolution || '1K' as ImageResolution,
      quality: task.quality || defaultImageQuality,
      size: task.size || 'auto'
    }
  }

  // deep watcher 会随 scope 销毁（用户离开页面）而失效，
  // jobId/完成结果这类"丢了就无法恢复"的状态要显式落盘
  function persistNow() {
    persistTasks(queue.value)
  }

  async function runImageTask(apiKey: string, task: MediaTask, editSources: File[]) {
    if (editSources.length) {
      const job = await createImageEditJob(apiKey, imageJobRequest(task), editSources)
      updateTask(task.id, { jobId: job.id })
      persistNow()
      return pollImageGenerationJob(job.id, () => isUnmounted)
    }

    const job = await createImageGenerationJob(apiKey, imageJobRequest(task))
    updateTask(task.id, { jobId: job.id })
    persistNow()
    return pollImageGenerationJob(job.id, () => isUnmounted)
  }

  async function runVideoTask(apiKey: string, task: MediaTask, sourceImage?: File) {
    const job = await createVideoGenerationJob(apiKey, {
      prompt: task.prompt,
      model: task.model,
      duration: task.duration || 10,
      resolution: task.videoResolution,
      image: sourceImage
    })
    updateTask(task.id, { jobId: job.id })
    persistNow()
    return pollVideoGenerationJob(job.id, () => isUnmounted)
  }

  async function submitStudioTask() {
    if (!canSubmit.value) return

    const uploadedSources = files.value.map(item => item.file)
    const uploadedIds = files.value.map(item => item.id)
    const sourceTask = uploadedSources.length ? null : selectedTask.value
    const sourceImageIds = sourceTask ? [sourceTask.id] : undefined
    const trimmedPrompt = prompt.value.trim()

    if (isVideoMode.value) {
      const task = createMediaTask({
        kind: 'video',
        type: uploadedSources.length || sourceTask ? 'edit' : 'generation',
        parentId: sourceTask?.id,
        sourceImageIds,
        prompt: trimmedPrompt
      })
      if (uploadedSources.length) {
        sourceFilesByTaskId.set(task.id, uploadedSources)
      }
      prompt.value = ''

      await executeMediaTask(
        task,
        async (apiKey) => {
          let sourceImage = uploadedSources[0]
          if (!sourceImage && sourceImageIds?.length) {
            sourceImage = (await getSourcesFromTaskIds(sourceImageIds))[0]
          }
          return runVideoTask(apiKey, task, sourceImage)
        },
        {
          getUploadedIdsToClear: () => uploadedIds
        }
      )
      return
    }

    // Grok 图片模型不支持编辑/参考图，提前拦截（保留输入让用户切模型）
    if ((uploadedSources.length || sourceTask) && !resolveMediaModelSpec(mediaModels.imageModel.value).supportsEdit) {
      toast.add({
        description: '当前图片模型不支持编辑/参考图，请切换到 GPT Image 2 或移除参考图',
        icon: 'i-lucide-circle-alert',
        color: 'warning'
      })
      return
    }

    const task = createMediaTask({
      kind: 'image',
      type: sourceTask || uploadedSources.length ? 'edit' : 'generation',
      parentId: sourceTask?.id,
      sourceImageIds,
      prompt: trimmedPrompt
    })
    if (uploadedSources.length) {
      sourceFilesByTaskId.set(task.id, uploadedSources)
    }
    prompt.value = ''

    await executeMediaTask(
      task,
      async (apiKey) => {
        let editSources: File[] = []
        if (uploadedSources.length) {
          editSources = uploadedSources
        } else if (sourceImageIds?.length) {
          editSources = await getSourcesFromTaskIds(sourceImageIds)
        }
        return runImageTask(apiKey, task, editSources)
      },
      {
        selectOnSuccess: Boolean(sourceTask),
        getUploadedIdsToClear: () => uploadedIds
      }
    )
  }

  async function retryMediaTask(task: MediaTask) {
    if (task.status === 'generating') return

    const sourceImageIds = task.sourceImageIds?.length
      ? task.sourceImageIds
      : task.parentId ? [task.parentId] : undefined
    let usedUploadedIds: string[] = []
    const cachedSources = sourceFilesByTaskId.get(task.id) || []

    const retryTask: MediaTask = {
      ...createMediaTask({
        kind: task.kind,
        type: task.type,
        parentId: task.parentId,
        sourceImageIds,
        prompt: task.prompt
      }),
      // 重试沿用原任务参数，而不是当前面板参数
      model: task.model,
      groupId: task.groupId,
      ratio: task.ratio,
      resolution: task.resolution,
      quality: task.quality,
      size: task.size,
      duration: task.duration,
      videoResolution: task.videoResolution
    }
    if (cachedSources.length) {
      sourceFilesByTaskId.set(retryTask.id, cachedSources)
    }

    if (task.kind === 'video') {
      await executeMediaTask(
        retryTask,
        async (apiKey) => {
          let sourceImage: File | undefined
          if (task.type === 'edit') {
            if (sourceImageIds?.length) {
              sourceImage = (await getSourcesFromTaskIds(sourceImageIds))[0]
            } else if (cachedSources.length) {
              sourceImage = cachedSources[0]
            } else if (files.value.length) {
              usedUploadedIds = files.value.slice(0, 1).map(item => item.id)
              sourceImage = files.value[0]?.file
            } else {
              throw new Error('找不到源图，请重新上传或选择图片后再试')
            }
          }
          return runVideoTask(apiKey, retryTask, sourceImage)
        },
        {
          getUploadedIdsToClear: () => usedUploadedIds
        }
      )
      return
    }

    await executeMediaTask(
      retryTask,
      async (apiKey) => {
        let editSources: File[] = []
        if (task.type === 'edit') {
          if (sourceImageIds?.length) {
            editSources = await getSourcesFromTaskIds(sourceImageIds)
          } else if (cachedSources.length) {
            editSources = cachedSources
          } else if (files.value.length) {
            usedUploadedIds = files.value.map(item => item.id)
            editSources = files.value.map(item => item.file)
          } else {
            throw new Error('找不到要编辑的图片，请重新上传或选择图片后再试')
          }
        }
        return runImageTask(apiKey, retryTask, editSources)
      },
      {
        selectOnSuccess: task.type === 'edit',
        getUploadedIdsToClear: () => usedUploadedIds
      }
    )
  }

  async function resumeMediaTask(task: MediaTask) {
    if (!task.jobId || task.status !== 'generating') return

    try {
      const result = task.kind === 'video'
        ? await pollVideoGenerationJob(task.jobId, () => isUnmounted)
        : await pollImageGenerationJob(task.jobId, () => isUnmounted)
      applyCompletedResult(task, result)
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

  function resumePendingTasks() {
    queue.value
      .filter(task => task.status === 'generating' && task.jobId)
      .forEach((task) => {
        void resumeMediaTask(task)
      })
  }

  // ---------------------------------------------------------------------------
  // 生命周期：由 studio.vue 的 onMounted/onBeforeUnmount 调用
  // ---------------------------------------------------------------------------

  function init() {
    isUnmounted = false
    mediaModels.init()
    void hydrateStoredImageAssets().catch(() => {})
    resumePendingTasks()
    durationTimer ||= setInterval(() => {
      timerNow.value = Date.now()
    }, 1000)
  }

  function dispose() {
    isUnmounted = true
    dragDepth = 0
    isDraggingImages.value = false
    if (durationTimer) {
      clearInterval(durationTimer)
      durationTimer = null
    }
    sourceFilesByTaskId.clear()
    clearUploadedImages()
  }

  return {
    // 输入状态
    prompt,
    ratio,
    resolution,
    quality,
    videoDuration,
    videoResolution,
    files,
    isDraggingImages,
    canSubmit,
    hasUploadedImages,
    currentUploadLimit,
    imageSize,
    estimatedCost,
    submitLabel,
    promptPlaceholder,
    isVideoMode,
    // 队列
    queue,
    imageTasks,
    videoTasks,
    selectedTask,
    selectedTaskId,
    selectedHistory,
    historyPanelOpen,
    downloadableTasks,
    batchMode,
    selectedBatchIds,
    selectedBatchTasks,
    // 预览
    previewTask,
    previewUploadedImage,
    previewImageUrl,
    previewVideoUrl,
    previewRevisedPrompt,
    // 上传
    appendUploadedImages,
    removeUploadedImage,
    clearUploadedImages,
    onPasteImages,
    onDragEnterImages,
    onDragOverImages,
    onDragLeaveImages,
    onDropImages,
    // 任务操作
    submitStudioTask,
    retryMediaTask,
    deleteMediaTask,
    deleteSelectedTasks,
    downloadMediaTask,
    downloadSelectedTasks,
    copyImage,
    copyRevisedPrompt,
    addTaskImageAsReference,
    reusePrompt,
    selectMediaTask,
    setCurrentTask,
    clearSelectedTask,
    toggleBatchMode,
    toggleBatchTask,
    selectAllBatchTasks,
    previewMediaTask,
    previewUploadedSource,
    closePreview,
    getTaskById,
    getTaskNumber,
    getTaskDurationSeconds,
    formatTaskCreatedAt,
    getMediaDownloadFilename,
    // 生命周期
    init,
    dispose
  }
})
