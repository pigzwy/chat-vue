// 自 useStudioTasks.ts（1436 行）移植：创作台任务队列/持久化/上传/提交/重试/恢复
// 持久化策略与 Vue 版完全一致：localStorage 存元数据（图片/视频各限 12 条），
// IndexedDB（sub2api-image-assets）存图片 base64；恢复轮询按 id 合并回队列。
import { createStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { requestConfirm } from '@/lib/confirm-store'
import { clearApiKeyForGroup, getApiKeyForGroup } from '@/lib/models-store'
import {
  curatedMediaOptions,
  groupForModel,
  initMediaModels,
  mediaModelsStore,
  setMediaMode
} from '@/lib/studio/media-models-store'
import {
  createImageEditJob,
  createImageGenerationJob,
  createVideoGenerationJob,
  parseJson,
  pollImageGenerationJob,
  pollVideoGenerationJob,
  type GeneratedMediaPayload,
  type MediaJobResponse
} from '@/lib/studio/media-jobs'
import {
  defaultImageQuality,
  imageQualities,
  imageRatios,
  imageResolutions,
  imageSizeMap,
  type ImageQuality,
  type ImageRatio,
  type ImageResolution
} from '@/lib/shared/images'
import {
  defaultVideoResolution,
  mediaApiKeyName,
  resolveMediaModelSpec,
  type MediaKind,
  type VideoResolution
} from '@/lib/shared/media-models'
import type { RequestError } from '@/lib/shared/errors'

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

export type StudioView = 'stream' | 'grid'

export interface StudioState {
  /** 生成记录视图:stream=对话流(默认,airgate/ChatGPT 式),grid=卡片网格 */
  studioView: StudioView
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  quality: ImageQuality
  videoDuration: number
  videoResolution: VideoResolution
  files: UploadedImage[]
  queue: MediaTask[]
  previewTask: MediaTask | null
  previewUploadedImage: UploadedImage | null
  selectedTaskId: string
  batchMode: boolean
  selectedBatchIds: string[]
  isDraggingImages: boolean
  historyPanelOpen: boolean
  timerNow: number
}

const studioViewStorageKey = 'sub2api-studio-view'
const mediaStorageKey = 'sub2api-media-tasks'
const legacyImageStorageKey = 'sub2api-image-tasks'
const imageQualityStorageKey = 'sub2api-image-quality'
const ratioStorageKey = 'sub2api-media-ratio'
const resolutionStorageKey = 'sub2api-media-resolution'
const videoDurationStorageKey = 'sub2api-media-video-duration'
const videoResolutionStorageKey = 'sub2api-media-video-resolution'
const imageDatabaseName = 'sub2api-image-assets'
const imageDatabaseStoreName = 'images'
const perKindStorageLimit = 12
export const uploadedImageLimit = 8
export const videoSourceImageLimit = 1
/** Grok 图生图上游最多 3 张参考图 */
export const grokEditSourceLimit = 3
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

function readStorage(key: string) {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(key)
  if (raw == null) return null
  // 兼容 vueuse useStorage 的 JSON 编码（"16:9" 带引号）与裸字符串
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : raw
  } catch {
    return raw
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

function createMediaTaskId() {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// localStorage 元数据持久化
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

// ---------------------------------------------------------------------------
// IndexedDB 图片资产
// ---------------------------------------------------------------------------

let imageDatabasePromise: Promise<IDBDatabase> | null = null

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

// ---------------------------------------------------------------------------
// store 初始化
// ---------------------------------------------------------------------------

function initialState(): StudioState {
  const ratio = readStorage(ratioStorageKey)
  const resolution = readStorage(resolutionStorageKey)
  const quality = readStorage(imageQualityStorageKey)
  const videoDuration = Number(readStorage(videoDurationStorageKey))
  const videoResolutionValue = readStorage(videoResolutionStorageKey)

  return {
    studioView: readStorage(studioViewStorageKey) === 'grid' ? 'grid' : 'stream',
    prompt: '',
    ratio: isImageRatio(ratio) ? ratio : '16:9',
    resolution: isImageResolution(resolution) ? resolution : '2K',
    quality: isImageQuality(quality) ? quality : defaultImageQuality,
    videoDuration: Number.isFinite(videoDuration) && videoDuration >= 1 ? videoDuration : 10,
    videoResolution: videoResolutionValue === '720p' ? '720p' : defaultVideoResolution,
    files: [],
    queue: loadStoredTasks(),
    previewTask: null,
    previewUploadedImage: null,
    selectedTaskId: '',
    batchMode: false,
    selectedBatchIds: [],
    isDraggingImages: false,
    historyPanelOpen: false,
    timerNow: Date.now()
  }
}

export const studioStore = createStore<StudioState>(initialState(), {
  // 与服务端渲染分支（无 localStorage）一致的快照，避免 /studio 直连水合不匹配
  serverSnapshot: {
    studioView: 'stream',
    prompt: '',
    ratio: '16:9',
    resolution: '2K',
    quality: defaultImageQuality,
    videoDuration: 10,
    videoResolution: defaultVideoResolution,
    files: [],
    queue: [],
    previewTask: null,
    previewUploadedImage: null,
    selectedTaskId: '',
    batchMode: false,
    selectedBatchIds: [],
    isDraggingImages: false,
    historyPanelOpen: false,
    timerNow: 0
  }
})

let durationTimer: ReturnType<typeof setInterval> | null = null
let isUnmounted = false
let dragDepth = 0
const sourceFilesByTaskId = new Map<string, File[]>()

function get() {
  return studioStore.get()
}

function patch(partial: Partial<StudioState>) {
  studioStore.set(prev => ({ ...prev, ...partial }))
}

/** 所有队列变更统一走这里：更新 + 持久化（对应 Vue 版的 deep watch） */
function setQueue(next: MediaTask[]) {
  patch({ queue: next })
  persistTasks(next)
}

// deep watcher 会随 scope 销毁（用户离开页面）而失效，
// jobId/完成结果这类"丢了就无法恢复"的状态要显式落盘
export function persistNow() {
  persistTasks(get().queue)
}

// ---------------------------------------------------------------------------
// 派生值（React 组件在渲染中调用，入参 state 来自 useStore()）
// ---------------------------------------------------------------------------

export function isVideoMode() {
  return mediaModelsStore.get().mediaMode === 'video'
}

export function currentUploadLimit() {
  if (isVideoMode()) return videoSourceImageLimit
  return resolveMediaModelSpec(mediaModelsStore.get().imageModel).provider === 'grok' ? grokEditSourceLimit : uploadedImageLimit
}

export function selectSelectedTask(state: StudioState) {
  return state.queue.find(item => item.id === state.selectedTaskId && item.imageUrl) || null
}

export function selectDownloadableTasks(state: StudioState) {
  return state.queue.filter(item => item.imageUrl || item.videoUrl)
}

export function selectSelectedBatchTasks(state: StudioState) {
  const selected = new Set(state.selectedBatchIds)
  return state.queue.filter(item => selected.has(item.id) && (item.imageUrl || item.videoUrl))
}

export function selectSelectedHistory(state: StudioState) {
  const selectedTask = selectSelectedTask(state)
  if (!selectedTask) return []

  const byId = new Map(state.queue.map(item => [item.id, item]))
  const history: MediaTask[] = []
  let current: MediaTask | undefined = selectedTask
  while (current) {
    history.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return history
}

export function selectEstimatedCost(state: StudioState) {
  const models = mediaModelsStore.get()
  if (models.mediaMode === 'video') {
    const rate = resolveMediaModelSpec(models.videoModel).costPerSecondByResolution?.[state.videoResolution]
    return rate ? rate * state.videoDuration : undefined
  }
  const spec = resolveMediaModelSpec(models.imageModel)
  if (spec.costPerImage) return spec.costPerImage
  return spec.costByResolution?.[state.resolution]
}

export function selectImageSize(state: StudioState) {
  return imageSizeMap[state.resolution][state.ratio]
}

export function selectSubmitLabel(state: StudioState) {
  const hasUploaded = state.files.length > 0
  if (isVideoMode()) {
    return hasUploaded || selectSelectedTask(state) ? '图生视频' : '生成视频'
  }
  if (hasUploaded) return '编辑上传图片'
  return selectSelectedTask(state) ? '编辑所选图片' : '生成图片'
}

export function selectPromptPlaceholder(state: StudioState) {
  const hasUploaded = state.files.length > 0
  if (isVideoMode()) {
    if (hasUploaded || selectSelectedTask(state)) return '描述画面如何动起来、镜头怎么运动...'
    return '描述你想生成的视频画面、动作和镜头...'
  }
  if (hasUploaded) return '描述你想怎么编辑上传的图片...'
  return selectSelectedTask(state) ? '描述你想怎么编辑这张图片...' : '描述你想生成的图片，也可以上传或拖拽图片以图生图...'
}

// ---------------------------------------------------------------------------
// 输入状态 setter
// ---------------------------------------------------------------------------

export function setPrompt(value: string) {
  patch({ prompt: value })
}

export function setRatio(value: ImageRatio) {
  patch({ ratio: value })
  writeStorage(ratioStorageKey, value)
}

export function setResolution(value: ImageResolution) {
  patch({ resolution: value })
  writeStorage(resolutionStorageKey, value)
}

export function setQuality(value: ImageQuality) {
  patch({ quality: value })
  writeStorage(imageQualityStorageKey, value)
}

export function setVideoDuration(value: number) {
  patch({ videoDuration: value })
  writeStorage(videoDurationStorageKey, String(value))
}

export function setVideoResolution(value: VideoResolution) {
  patch({ videoResolution: value })
  writeStorage(videoResolutionStorageKey, value)
}

export function setHistoryPanelOpen(open: boolean) {
  patch({ historyPanelOpen: open })
}

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

export function removeUploadedImage(id: string) {
  const state = get()
  const target = state.files.find(item => item.id === id)
  if (!target) return

  revokeUploadedImage(target)
  patch({
    files: state.files.filter(item => item.id !== id),
    previewUploadedImage: state.previewUploadedImage?.id === id ? null : state.previewUploadedImage
  })
}

export function clearUploadedImages() {
  const state = get()
  state.files.forEach(revokeUploadedImage)
  patch({ files: [], previewUploadedImage: null })
}

/** 模式/模型切换导致源图上限收紧时裁剪超出部分（对应 Vue 的 currentUploadLimit watcher） */
export function trimUploadedImagesToLimit() {
  const limit = currentUploadLimit()
  const state = get()
  if (state.files.length <= limit) return

  state.files.slice(limit).forEach(revokeUploadedImage)
  patch({ files: state.files.slice(0, limit) })
  toast({
    description: `当前模式最多使用 ${limit} 张源图，已保留前 ${limit} 张`,
    color: 'warning'
  })
}

function getImageFiles(filesLike: FileList | File[]) {
  // 部分手机拍摄/分享的文件 type 为空，也放进来尝试转码
  return Array.from(filesLike).filter(file => file.type.startsWith('image/') || file.type === '')
}

const supportedSourceTypes = ['image/png', 'image/jpeg', 'image/webp']
const normalizedMaxDimension = 2560
// 手机原图动辄 8-15MB，超过它就压一轮，避免撞服务端 10MB 限制/上游体积限制
const normalizeSizeThreshold = 3 * 1024 * 1024

// 服务端不收的格式（HEIC 等）或过大的图：浏览器能解码就转成 JPEG 并压尺寸
async function normalizeSourceImage(file: File): Promise<File> {
  if (supportedSourceTypes.includes(file.type) && file.size <= normalizeSizeThreshold) return file

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

export async function appendUploadedImages(imageFiles: File[]) {
  const limit = currentUploadLimit()
  const remaining = limit - get().files.length
  if (remaining <= 0) {
    toast({ description: `最多上传 ${limit} 张图片`, color: 'warning' })
    return
  }

  const accepted = await Promise.all(imageFiles.slice(0, remaining).map(normalizeSourceImage))
  patch({ files: [...get().files, ...accepted.map(createUploadedImage)] })
  if (imageFiles.length > remaining) {
    toast({ description: `最多上传 ${limit} 张图片，已自动保留前 ${remaining} 张`, color: 'warning' })
  }
}

export function onPasteImages(event: ClipboardEvent | React.ClipboardEvent) {
  const imageFiles = getImageFiles(event.clipboardData?.files || [])
  if (!imageFiles.length) return

  event.preventDefault()
  void appendUploadedImages(imageFiles)
}

// dragenter/dragleave 成对计数：拖过子元素时两者都会触发，
// 只按 currentTarget 判断会让"拖出窗口"漏掉复位，遮罩永久残留
function hasDraggedImage(event: React.DragEvent | DragEvent) {
  return Array.from(event.dataTransfer?.items || []).some(item => item.type.startsWith('image/'))
}

export function onDragEnterImages(event: React.DragEvent | DragEvent) {
  if (!hasDraggedImage(event)) return

  event.preventDefault()
  dragDepth++
  patch({ isDraggingImages: true })
}

export function onDragOverImages(event: React.DragEvent | DragEvent) {
  if (!hasDraggedImage(event)) return
  event.preventDefault()
}

export function onDragLeaveImages() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    patch({ isDraggingImages: false })
  }
}

export function onDropImages(event: React.DragEvent | DragEvent) {
  dragDepth = 0
  patch({ isDraggingImages: false })

  const imageFiles = getImageFiles(event.dataTransfer?.files || [])
  if (!imageFiles.length) return

  event.preventDefault()
  void appendUploadedImages(imageFiles)
}

// ---------------------------------------------------------------------------
// 任务队列
// ---------------------------------------------------------------------------

function normalizeApiErrorMessage(message: string) {
  if (/no eligible .* accounts/i.test(message)) {
    return '当前密钥的分组没有能跑这个模型的账号——请在模型菜单换一个可用模型,或退出后用对应分组的 API Key 登录'
  }
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

function updateTask(id: string, taskPatch: Partial<MediaTask>) {
  const state = get()
  const index = state.queue.findIndex(item => item.id === id)
  if (index === -1) return

  const current = state.queue[index]
  if (!current) return

  if (taskPatch.imageUrl) {
    void putImageAsset(current.id, taskPatch.imageUrl).catch(() => {})
  }

  const next = [...state.queue]
  next[index] = { ...current, ...taskPatch }
  setQueue(next)
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

export function getTaskById(id?: string) {
  if (!id) return null
  return get().queue.find(item => item.id === id) || null
}

export function getTaskNumber(state: StudioState, task?: MediaTask | null) {
  if (!task) return ''

  const index = state.queue.findIndex(item => item.id === task.id)
  if (index === -1) return ''

  return `#${state.queue.length - index}`
}

function getDurationSeconds(startedAt: Date) {
  return Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 1000))
}

export function getTaskDurationSeconds(state: StudioState, task: MediaTask) {
  if (task.durationSeconds) return task.durationSeconds
  if (task.status !== 'generating') return 0

  return Math.max(1, Math.round((state.timerNow - task.createdAt.getTime()) / 1000))
}

export function formatTaskCreatedAt(task: MediaTask) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(task.createdAt)
}

export function reusePrompt(task: MediaTask) {
  patch({ prompt: task.prompt })
  // 通知输入框聚焦(移动端顺带唤起键盘),方便立即修改
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('studio:focus-prompt'))
  }
}

export function selectMediaTask(task: MediaTask) {
  if (task.kind !== 'image' || !task.imageUrl) return
  patch({ selectedTaskId: get().selectedTaskId === task.id ? '' : task.id })
}

export function setCurrentTask(task: MediaTask) {
  if (task.kind !== 'image' || !task.imageUrl) return
  patch({ selectedTaskId: task.id })
}

/** 一键图生视频：选中该图并切到视频模式 */
export function startVideoFromTask(task: MediaTask) {
  if (task.kind !== 'image' || !task.imageUrl) return
  patch({ selectedTaskId: task.id })
  setMediaMode('video')
  closePreview()
}

export function clearSelectedTask() {
  patch({ selectedTaskId: '' })
}

export function previewMediaTask(task: MediaTask) {
  if (!task.imageUrl && !task.videoUrl) return
  patch({ previewUploadedImage: null, previewTask: task })
}

export function previewUploadedSource(image: UploadedImage) {
  patch({ previewTask: null, previewUploadedImage: image })
}

export function closePreview() {
  patch({ previewTask: null, previewUploadedImage: null })
}

export function getMediaDownloadFilename(task: Pick<MediaTask, 'id' | 'createdAt' | 'model' | 'kind' | 'imageUrl'>) {
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

export async function downloadMediaTask(task: MediaTask) {
  const filename = getMediaDownloadFilename(task)

  if (task.videoUrl) {
    // 跨域视频 URL 无法直接 download，先转 blob；404 表示代理已过期，别再开新窗口
    try {
      const response = await fetch(task.videoUrl)
      if (response.status === 404) {
        toast({ description: '视频已过期，无法下载，请重新生成', color: 'warning' })
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

export async function copyImage(task: MediaTask) {
  if (!task.imageUrl) return

  try {
    const file = await imageUrlToFile(task.imageUrl, getMediaDownloadFilename(task))
    await navigator.clipboard.write([
      new ClipboardItem({ [file.type || 'image/png']: file })
    ])
    toast({ title: '图片已复制', description: '已复制到剪贴板' })
  } catch {
    toast({ title: '复制失败', description: '当前浏览器不支持复制图片，请使用下载', color: 'warning' })
  }
}

export async function addTaskImageAsReference(task: MediaTask) {
  if (!task.imageUrl) return

  const limit = currentUploadLimit()
  const remaining = limit - get().files.length
  if (remaining <= 0) {
    toast({ description: `最多上传 ${limit} 张图片`, color: 'warning' })
    return
  }

  try {
    const file = await imageUrlToFile(task.imageUrl, getMediaDownloadFilename(task))
    const previewUrl = URL.createObjectURL(file)
    patch({ files: [...get().files, createUploadedImageFromFile(file, previewUrl)] })
    clearSelectedTask()
    closePreview()
    toast({ title: '已加入参考图', description: '会在下一次提交时作为编辑参考' })
  } catch {
    toast({ title: '加入参考图失败', description: '图片读取失败，请重新生成或下载后上传', color: 'error' })
  }
}

export async function copyRevisedPrompt(text?: string) {
  if (!text) return

  await navigator.clipboard.writeText(text)
  toast({ title: '已复制', description: '内容已复制到剪贴板' })
}

// ---------------------------------------------------------------------------
// 删除 / 批量
// ---------------------------------------------------------------------------

function confirmDelete() {
  return requestConfirm({
    title: '删除记录',
    description: '确定要删除这条生成记录吗？此操作只会从当前浏览器历史中移除。'
  })
}

export async function deleteMediaTask(task: MediaTask) {
  if (!await confirmDelete()) return

  const state = get()
  // 只删除用户点击的这一条。旧 localStorage 数据可能存在重复 id，不能按 id 批量过滤。
  const targetIndex = state.queue.findIndex(item => item === task)
  const fallbackIndex = state.queue.filter(item => item.id === task.id).length === 1
    ? state.queue.findIndex(item => item.id === task.id)
    : -1
  const index = targetIndex === -1 ? fallbackIndex : targetIndex
  if (index === -1) return

  const next = [...state.queue]
  next.splice(index, 1)
  setQueue(next)
  void deleteImageAsset(task.id).catch(() => {})

  const cleanup: Partial<StudioState> = {}
  if (state.selectedTaskId === task.id) cleanup.selectedTaskId = ''
  if (state.previewTask?.id === task.id) cleanup.previewTask = null
  if (Object.keys(cleanup).length) patch(cleanup)

  toast({ title: '已删除', description: '已从本地生成历史中移除' })
}

export function setStudioView(view: StudioView) {
  patch({ studioView: view })
  writeStorage(studioViewStorageKey, view)
}

export function toggleBatchMode() {
  const entering = !get().batchMode
  // 批量选择依赖卡片网格的复选交互,进入批量模式时自动切网格视图
  if (entering && get().studioView === 'stream') setStudioView('grid')
  patch({ batchMode: entering, selectedBatchIds: [] })
}

export function toggleBatchTask(task: MediaTask) {
  if (!task.imageUrl && !task.videoUrl) return

  const selected = new Set(get().selectedBatchIds)
  if (selected.has(task.id)) {
    selected.delete(task.id)
  } else {
    selected.add(task.id)
  }
  patch({ selectedBatchIds: Array.from(selected) })
}

export function selectAllBatchTasks() {
  patch({ selectedBatchIds: selectDownloadableTasks(get()).map(task => task.id) })
}

export function downloadSelectedTasks() {
  selectSelectedBatchTasks(get()).forEach((task, index) => {
    window.setTimeout(() => {
      void downloadMediaTask(task)
    }, index * 150)
  })
}

export async function deleteSelectedTasks() {
  const state = get()
  const batchTasks = selectSelectedBatchTasks(state)
  if (!batchTasks.length) return
  if (!await confirmDelete()) return

  const selected = new Set(batchTasks.map(task => task.id))
  setQueue(get().queue.filter(task => !selected.has(task.id)))
  selected.forEach((id) => {
    void deleteImageAsset(id).catch(() => {})
  })

  const current = get()
  const cleanup: Partial<StudioState> = { selectedBatchIds: [], batchMode: false }
  if (current.selectedTaskId && selected.has(current.selectedTaskId)) cleanup.selectedTaskId = ''
  if (current.previewTask?.id && selected.has(current.previewTask.id)) cleanup.previewTask = null
  patch(cleanup)

  toast({ title: '已删除', description: `已删除 ${selected.size} 条生成记录` })
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
    toast({ title: '视频生成完成', description: '视频链接约 2 小时内有效，请及时下载保存' })
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
  setQueue([task, ...get().queue])

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
      patch({ selectedTaskId: task.id })
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
    toast({ description: message, color: 'error' })
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
  const models = mediaModelsStore.get()
  const state = get()
  const model = input.kind === 'video' ? models.videoModel : models.imageModel
  const base = {
    id: createMediaTaskId(),
    type: input.type,
    parentId: input.parentId,
    sourceImageIds: input.sourceImageIds,
    prompt: input.prompt,
    model,
    // 分组跟着模型走：GPT Image → 分组 25，Grok 全系 → 分组 66
    groupId: groupForModel(model),
    status: 'generating' as const,
    createdAt: new Date()
  }

  if (input.kind === 'video') {
    return {
      ...base,
      kind: 'video',
      duration: state.videoDuration,
      videoResolution: state.videoResolution
    }
  }

  return {
    ...base,
    kind: 'image',
    ratio: state.ratio,
    resolution: state.resolution,
    quality: state.quality,
    size: selectImageSize(state)
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

export async function submitStudioTask() {
  const state = get()
  if (!state.prompt.trim()) return

  // sk 直连的严格模式下,该类目可能确实一个可用模型都没有——提交前拦截
  const models = mediaModelsStore.get()
  if (models.strictAvailability && !curatedMediaOptions(models, models.mediaMode).length) {
    toast({
      description: `当前密钥的分组没有可用的${models.mediaMode === 'video' ? '视频' : '图片'}模型,请退出后用对应分组的 API Key 登录`,
      color: 'warning'
    })
    return
  }

  const uploadedSources = state.files.map(item => item.file)
  const uploadedIds = state.files.map(item => item.id)
  const sourceTask = uploadedSources.length ? null : selectSelectedTask(state)
  const sourceImageIds = sourceTask ? [sourceTask.id] : undefined
  const trimmedPrompt = state.prompt.trim()

  if (isVideoMode()) {
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
    patch({ prompt: '' })

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

  // Grok 图片模型不支持编辑/参考图时提前拦截（保留输入让用户切模型）
  if ((uploadedSources.length || sourceTask) && !resolveMediaModelSpec(mediaModelsStore.get().imageModel).supportsEdit) {
    toast({ description: '当前图片模型不支持编辑/参考图，请切换到 GPT Image 2 或移除参考图', color: 'warning' })
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
  patch({ prompt: '' })

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

export async function retryMediaTask(task: MediaTask) {
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
          } else if (get().files.length) {
            usedUploadedIds = get().files.slice(0, 1).map(item => item.id)
            sourceImage = get().files[0]?.file
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
        } else if (get().files.length) {
          usedUploadedIds = get().files.map(item => item.id)
          editSources = get().files.map(item => item.file)
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
  get().queue
    .filter(task => task.status === 'generating' && task.jobId)
    .forEach((task) => {
      void resumeMediaTask(task)
    })
}

async function hydrateStoredImageAssets() {
  // 按 id 合并回当前队列而不是整体替换：hydrate 期间恢复轮询可能已把任务写成
  // completed，整体替换会用旧快照把它回滚成 generating（且不再有人更新）
  const snapshots = [...get().queue]
  await Promise.all(snapshots.map(async (task) => {
    if (task.imageUrl?.startsWith('data:')) {
      await putImageAsset(task.id, task.imageUrl)
      return
    }
    if (task.kind === 'video' || task.imageUrl) return

    const imageUrl = await getImageAsset(task.id)
    if (!imageUrl) return

    const state = get()
    const index = state.queue.findIndex(item => item.id === task.id)
    const current = state.queue[index]
    if (index !== -1 && current && !current.imageUrl) {
      const next = [...state.queue]
      next[index] = { ...current, imageUrl }
      patch({ queue: next })
    }
  }))

  persistNow()
}

// ---------------------------------------------------------------------------
// 生命周期：由 studio 页面 useEffect 调用
// ---------------------------------------------------------------------------

export function initStudio() {
  isUnmounted = false
  initMediaModels()
  void hydrateStoredImageAssets().catch(() => {})
  resumePendingTasks()
  durationTimer ||= setInterval(() => {
    patch({ timerNow: Date.now() })
  }, 1000)
}

export function disposeStudio() {
  isUnmounted = true
  dragDepth = 0
  patch({ isDraggingImages: false })
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
  sourceFilesByTaskId.clear()
  clearUploadedImages()
}
