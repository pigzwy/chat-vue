import { createStore } from './store'
import { MODELS } from './shared/models'
import { isMediaModelId } from './shared/media-models'
import type { ReasoningEffort } from './shared/reasoning'
import { csrfHeaderName, getCsrfToken } from './csrf'

interface ApiResponse<T> {
  data: T
}

interface GroupItem {
  id: number
  name: string
  platform?: string
}

interface ApiKeyItem {
  key: string
  status: string
}

interface ApiKeyCacheItem {
  token: string
  key: string
}

interface ModelReasoningEffortItem {
  value: string
  label?: string
}

interface ModelItem {
  id: string
  display_name?: string
  supportsReasoningEffort?: boolean
  reasoningEffort?: string
  reasoningEfforts?: ModelReasoningEffortItem[]
}

export interface ModelReasoningMeta {
  supported: boolean
  default?: string
  efforts: Array<{ value: string, label: string }>
}

export interface GroupSelectItem {
  label: string
  value: number
  icon: string
}

export interface ModelSelectItem {
  label: string
  value: string
  icon: string
  reasoning?: ModelReasoningMeta
}

interface ModelsCacheItem {
  token: string
  items: ModelSelectItem[]
}

export interface ModelsState {
  token: string
  group: number | null
  model: string
  reasoningEffort: ReasoningEffort
  groups: GroupSelectItem[]
  models: ModelSelectItem[]
  apiKey: string
  loading: boolean
  error: string
}

const TOKEN_KEY = 'sub2api-token'
const GROUP_KEY = 'sub2api-group'
const MODEL_KEY = 'model'
const EFFORT_KEY = 'reasoning-effort'
const API_KEY_KEY = 'sub2api-api-key'
const API_KEYS_KEY = 'sub2api-api-keys'
const GROUPS_CACHE_KEY = 'sub2api-groups-cache'
const MODELS_CACHE_KEY = 'sub2api-models-cache-v2'
const defaultErrorMessage = '加载 Sub2API 失败'

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function readString(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  // 兼容 vueuse useStorage 的裸字符串与 JSON 字符串两种历史格式
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : raw
  } catch {
    return raw
  }
}

function writeString(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function getItems<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[]
  const data = (response as { data?: unknown })?.data
  if (Array.isArray(data)) return data as T[]
  const dataItems = (data as { items?: unknown })?.items
  if (Array.isArray(dataItems)) return dataItems as T[]
  const items = (response as { items?: unknown })?.items
  if (Array.isArray(items)) return items as T[]
  return []
}

export function iconForProvider(value?: string) {
  const normalized = value?.toLowerCase() || ''
  if (normalized.includes('anthropic') || normalized.includes('claude')) return 'anthropic'
  if (normalized.includes('google') || normalized.includes('gemini')) return 'google'
  if (normalized.includes('grok') || normalized.includes('xai') || normalized.includes('x-ai')) return 'grok'
  if (normalized.includes('openai') || normalized.includes('gpt')) return 'openai'
  return 'box'
}

function capitalizeFirst(value: string) {
  const text = value.trim()
  if (!text) return text
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function toModelSelectItem(item: ModelItem): ModelSelectItem {
  const efforts = (item.reasoningEfforts || [])
    .filter(effort => typeof effort?.value === 'string' && effort.value)
    .map(effort => ({ value: effort.value, label: effort.label || capitalizeFirst(effort.value) }))

  return {
    label: capitalizeFirst(item.display_name || item.id),
    value: item.id,
    icon: iconForProvider(item.id),
    reasoning: item.supportsReasoningEffort != null || efforts.length
      ? {
          supported: item.supportsReasoningEffort ?? efforts.length > 0,
          default: item.reasoningEffort,
          efforts
        }
      : undefined
  }
}

async function sub2apiFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`/sub2api${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `请求失败: ${response.status}`)
  }
  return response.json()
}

function toErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (!message) return defaultErrorMessage
  try {
    const parsed = JSON.parse(message)
    const errorMessage = parsed.message || parsed.error?.message || message
    return errorMessage === 'Token has expired' ? 'Token失效 请从主网站重新登录' : errorMessage
  } catch {
    return message === 'Token has expired' ? 'Token失效 请从主网站重新登录' : message
  }
}

export const modelsStore = createStore<ModelsState>({
  token: '',
  group: null,
  model: 'anthropic/claude-haiku-4.5',
  reasoningEffort: 'auto',
  groups: [],
  models: MODELS,
  apiKey: '',
  loading: false,
  error: ''
})

function patch(partial: Partial<ModelsState>) {
  modelsStore.set(state => ({ ...state, ...partial }))
}

function toChatModels(items: ModelSelectItem[]) {
  // 媒体模型发到聊天端点会被上游 400，聊天列表过滤
  return items.filter(item => !isMediaModelId(item.value))
}

function readTokenFromUrl() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (!token) return ''
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  return token
}

let initialized = false

export async function initModels() {
  if (typeof window === 'undefined' || initialized) return
  initialized = true

  const storedToken = readString(TOKEN_KEY)
  const urlToken = readTokenFromUrl()
  let token = storedToken
  if (urlToken) {
    if (urlToken !== storedToken) {
      writeJson(GROUPS_CACHE_KEY, null)
      writeJson(MODELS_CACHE_KEY, {})
      writeJson(API_KEYS_KEY, {})
      writeString(API_KEY_KEY, '')
    }
    token = urlToken
    writeString(TOKEN_KEY, token)
  }

  patch({
    token,
    group: readJson<number | null>(GROUP_KEY, null),
    model: readString(MODEL_KEY, 'anthropic/claude-haiku-4.5'),
    reasoningEffort: readString(EFFORT_KEY, 'auto') as ReasoningEffort,
    apiKey: readString(API_KEY_KEY, '')
  })

  if (!token) return
  await loadGroups()
}

export function setModel(model: string) {
  patch({ model })
  writeString(MODEL_KEY, model)
}

export function setReasoningEffort(effort: ReasoningEffort) {
  patch({ reasoningEffort: effort })
  writeString(EFFORT_KEY, effort)
}

async function loadGroups() {
  const { token } = modelsStore.get()
  patch({ loading: true, error: '' })
  try {
    const cached = readJson<{ token: string, items: GroupSelectItem[] } | null>(GROUPS_CACHE_KEY, null)
    let groups: GroupSelectItem[]
    if (cached?.token === token && cached.items.length) {
      groups = cached.items
    } else {
      const response = await sub2apiFetch<unknown>('/api/v1/groups/available', token)
      groups = getItems<GroupItem>(response).map(item => ({
        label: item.name,
        value: item.id,
        icon: iconForProvider(item.platform || item.name)
      }))
      if (!groups.length) throw new Error('没有可用分组')
      writeJson(GROUPS_CACHE_KEY, { token, items: groups })
    }

    let group = modelsStore.get().group
    if (!group || !groups.some(item => item.value === group)) {
      group = groups[0]?.value ?? null
      writeJson(GROUP_KEY, group)
    }
    patch({ groups, group })

    if (group != null) {
      await loadModels(group)
    }
  } catch (error) {
    patch({ groups: [], error: toErrorMessage(error) })
  } finally {
    patch({ loading: false })
  }
}

async function loadModels(groupId: number) {
  const { token } = modelsStore.get()
  if (!token) return

  const cacheKey = String(groupId)
  const apiKey = await getApiKeyForGroup(groupId)
  patch({ apiKey })
  writeString(API_KEY_KEY, apiKey)

  const cache = readJson<Record<string, ModelsCacheItem>>(MODELS_CACHE_KEY, {})
  const cached = cache[cacheKey]
  let allItems: ModelSelectItem[]
  if (cached?.token === token && cached.items.length) {
    allItems = cached.items
  } else {
    const response = await sub2apiFetch<unknown>('/v1/models', apiKey)
    allItems = getItems<ModelItem>(response).map(toModelSelectItem)
    if (!allItems.length) throw new Error('没有可用模型')
    writeJson(MODELS_CACHE_KEY, { ...cache, [cacheKey]: { token, items: allItems } })
  }

  const models = toChatModels(allItems)
  let model = modelsStore.get().model
  if (!models.some(item => item.value === model)) {
    model = models[0]?.value || ''
    writeString(MODEL_KEY, model)
  }
  patch({ models, model })
}

export async function selectGroup(groupId: number) {
  patch({ group: groupId, loading: true, error: '' })
  writeJson(GROUP_KEY, groupId)
  try {
    await loadModels(groupId)
  } catch (error) {
    patch({ error: toErrorMessage(error) })
  } finally {
    patch({ loading: false })
  }
}

function getCachedApiKey(cache: Record<string, string | ApiKeyCacheItem>, groupId: number, token: string) {
  const item = cache[String(groupId)]
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.token === token ? item.key : ''
}

export async function getApiKeyForGroup(groupId: number, keyName = 'chat') {
  const { token } = modelsStore.get()
  if (!token) throw new Error('缺少 Sub2API token')

  const cacheKey = String(groupId)
  const cache = readJson<Record<string, string | ApiKeyCacheItem>>(API_KEYS_KEY, {})
  const cachedKey = getCachedApiKey(cache, groupId, token)
  if (cachedKey) {
    writeJson(API_KEYS_KEY, { ...cache, [cacheKey]: { token, key: cachedKey } })
    return cachedKey
  }

  const params = new URLSearchParams({ page: '1', page_size: '100', group_id: String(groupId) })
  const keysResponse = await sub2apiFetch<unknown>(`/api/v1/keys?${params}`, token)
  const activeKey = getItems<ApiKeyItem>(keysResponse).find(key => key.status === 'active')
  const key = activeKey?.key || await createApiKey(groupId, keyName)
  writeJson(API_KEYS_KEY, { ...cache, [cacheKey]: { token, key } })
  return key
}

export function hasSub2apiToken() {
  return Boolean(modelsStore.get().token)
}

/** 拉取指定分组的模型列表（带缓存；会按需自动创建该分组的 key）——创作台用 */
export async function getModelsForGroup(groupId: number, keyName = 'chat'): Promise<ModelSelectItem[]> {
  const { token } = modelsStore.get()
  if (!token) return []

  const cacheKey = String(groupId)
  const cache = readJson<Record<string, ModelsCacheItem>>(MODELS_CACHE_KEY, {})
  const cached = cache[cacheKey]
  if (cached?.token === token && cached.items.length) {
    return cached.items
  }

  const groupApiKey = await getApiKeyForGroup(groupId, keyName)
  const response = await sub2apiFetch<unknown>('/v1/models', groupApiKey)
  const items = getItems<ModelItem>(response).map(toModelSelectItem)
  if (items.length) {
    writeJson(MODELS_CACHE_KEY, { ...cache, [cacheKey]: { token, items } })
  }
  return items
}

export function clearApiKeyForGroup(groupId: number) {
  const cache = readJson<Record<string, string | ApiKeyCacheItem>>(API_KEYS_KEY, {})
  const cacheKey = String(groupId)
  if (!(cacheKey in cache)) return
  delete cache[cacheKey]
  writeJson(API_KEYS_KEY, cache)
}

async function createApiKey(groupId: number, keyName: string) {
  const { token } = modelsStore.get()
  const response = await fetch('/sub2api/api/v1/keys', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      [csrfHeaderName]: getCsrfToken(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: keyName, group_id: groupId })
  })
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `创建 API Key 失败: ${response.status}`))
  }
  const result = await response.json() as ApiResponse<ApiKeyItem>
  return result.data.key
}
