import { computed, onMounted, ref } from 'vue'
import { createSharedComposable, useStorage } from '@vueuse/core'
import { MODELS } from '../../shared/utils/models'
import type { ReasoningEffort } from '../../shared/utils/reasoning'
import { useCsrf } from './useCsrf'

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

interface ModelItem {
  id: string
  display_name?: string
}

type GroupSelectItem = { label: string, value: number, icon: string }
type ModelSelectItem = { label: string, value: string, icon: string }

interface GroupCache {
  token: string
  items: GroupSelectItem[]
}

interface ModelsCacheItem {
  token: string
  items: ModelSelectItem[]
}

type ApiKeyCacheValue = string | ApiKeyCacheItem

const SUB2API_TOKEN_KEY = 'sub2api-token'
const defaultErrorMessage = '加载 Sub2API 失败'

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

function iconForProvider(value?: string) {
  const normalized = value?.toLowerCase() || ''
  if (normalized.includes('anthropic') || normalized.includes('claude')) return 'i-simple-icons:anthropic'
  if (normalized.includes('google') || normalized.includes('gemini')) return 'i-simple-icons:google'
  if (normalized.includes('openai') || normalized.includes('gpt')) return 'i-simple-icons:openai'
  return 'i-lucide-box'
}

function capitalizeFirst(value: string) {
  const text = value.trim()
  if (!text) return text
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function toGroupSelectItem(item: GroupItem): GroupSelectItem {
  return {
    label: item.name,
    value: item.id,
    icon: iconForProvider(item.platform || item.name)
  }
}

function toModelSelectItem(item: ModelItem): ModelSelectItem {
  return {
    label: capitalizeFirst(item.display_name || item.id),
    value: item.id,
    icon: iconForProvider(item.id)
  }
}

async function sub2apiFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`/sub2api${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
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
    return parsed.message || parsed.error?.message || message
  } catch {
    return message
  }
}

function readTokenFromUrl() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (!token) return ''

  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  return token
}

function getCachedApiKey(cache: Record<string, ApiKeyCacheValue>, groupId: number, token: string) {
  const item = cache[String(groupId)]
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.token === token ? item.key : ''
}

export const useModels = createSharedComposable(() => {
  const token = useStorage(SUB2API_TOKEN_KEY, '')
  const group = useStorage<number | null>('sub2api-group', null)
  const model = useStorage<string>('model', 'anthropic/claude-haiku-4.5')
  const reasoningEffort = useStorage<ReasoningEffort>('reasoning-effort', 'auto')
  const apiKey = useStorage('sub2api-api-key', '')
  const apiKeysByGroup = useStorage<Record<string, ApiKeyCacheValue>>('sub2api-api-keys', {})
  const cachedGroups = useStorage<GroupCache | null>('sub2api-groups-cache', null)
  const cachedModelsByGroup = useStorage<Record<string, ModelsCacheItem>>('sub2api-models-cache', {})
  const groupItems = ref<GroupSelectItem[]>([])
  const modelItems = ref(MODELS)
  const loading = ref(false)
  const error = ref('')
  const { csrf, headerName } = useCsrf()

  const hasSub2apiToken = computed(() => Boolean(token.value))

  async function init() {
    if (typeof window === 'undefined') return
    const urlToken = readTokenFromUrl()
    if (urlToken) {
      if (urlToken !== token.value) {
        cachedGroups.value = null
        cachedModelsByGroup.value = {}
        apiKeysByGroup.value = {}
        apiKey.value = ''
      }
      token.value = urlToken
    }
    if (!token.value) return

    await loadGroups()
  }

  async function loadGroups() {
    loading.value = true
    error.value = ''
    try {
      if (cachedGroups.value?.token === token.value && cachedGroups.value.items.length) {
        groupItems.value = cachedGroups.value.items

        if (!group.value || !groupItems.value.some(item => item.value === group.value)) {
          group.value = groupItems.value[0]?.value || null
        }

        if (group.value) {
          try {
            await loadModels(group.value)
          } catch (e) {
            error.value = toErrorMessage(e)
          }
        }
        return
      }

      const response = await sub2apiFetch<unknown>('/api/v1/groups/available', token.value)
      groupItems.value = getItems<GroupItem>(response).map(toGroupSelectItem)

      if (!groupItems.value.length) {
        throw new Error('没有可用分组')
      }

      cachedGroups.value = {
        token: token.value,
        items: groupItems.value
      }

      if (!group.value || !groupItems.value.some(item => item.value === group.value)) {
        group.value = groupItems.value[0]?.value || null
      }

      if (group.value) {
        try {
          await loadModels(group.value)
        } catch (e) {
          error.value = toErrorMessage(e)
        }
      }
    } catch (e) {
      groupItems.value = []
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function loadModels(groupId: number) {
    if (!token.value) return

    const cacheKey = String(groupId)
    apiKey.value = await getApiKeyForGroup(groupId)

    const cachedModels = cachedModelsByGroup.value[cacheKey]
    if (cachedModels?.token === token.value && cachedModels.items.length) {
      modelItems.value = cachedModels.items
      if (!modelItems.value.some(item => item.value === model.value)) {
        model.value = modelItems.value[0]?.value || ''
      }
      return
    }

    const modelsResponse = await sub2apiFetch<unknown>('/v1/models', apiKey.value)
    modelItems.value = getItems<ModelItem>(modelsResponse).map(toModelSelectItem)

    if (!modelItems.value.length) {
      throw new Error('没有可用模型')
    }

    cachedModelsByGroup.value = {
      ...cachedModelsByGroup.value,
      [cacheKey]: {
        token: token.value,
        items: modelItems.value
      }
    }

    if (!modelItems.value.some(item => item.value === model.value)) {
      model.value = modelItems.value[0]?.value || ''
    }
  }

  async function getApiKeyForGroup(groupId: number, keyName = 'chat') {
    if (!token.value) {
      throw new Error('缺少 Sub2API token')
    }

    const cacheKey = String(groupId)
    const cachedKey = getCachedApiKey(apiKeysByGroup.value, groupId, token.value)
    if (cachedKey) {
      if (typeof apiKeysByGroup.value[cacheKey] === 'string') {
        apiKeysByGroup.value = {
          ...apiKeysByGroup.value,
          [cacheKey]: {
            token: token.value,
            key: cachedKey
          }
        }
      }
      return cachedKey
    }

    const params = new URLSearchParams({
      page: '1',
      page_size: '100',
      group_id: String(groupId)
    })
    const keysResponse = await sub2apiFetch<unknown>(`/api/v1/keys?${params}`, token.value)
    const activeKey = getItems<ApiKeyItem>(keysResponse).find(key => key.status === 'active')
    const key = activeKey?.key || await createApiKey(groupId, keyName)
    apiKeysByGroup.value = {
      ...apiKeysByGroup.value,
      [cacheKey]: {
        token: token.value,
        key
      }
    }
    return key
  }

  function clearApiKeyForGroup(groupId: number) {
    const cacheKey = String(groupId)
    if (!apiKeysByGroup.value[cacheKey]) return

    const next = { ...apiKeysByGroup.value }
    delete next[cacheKey]
    apiKeysByGroup.value = next
  }

  async function createApiKey(groupId: number, keyName: string) {
    const response = await fetch('/sub2api/api/v1/keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.value}`,
        [headerName]: csrf(),
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

  async function selectGroup(groupId: number) {
    group.value = groupId
    loading.value = true
    error.value = ''
    try {
      await loadModels(groupId)
    } catch (e) {
      error.value = toErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  onMounted(init)

  return {
    apiKey,
    error,
    clearApiKeyForGroup,
    group,
    groups: groupItems,
    getApiKeyForGroup,
    hasSub2apiToken,
    loading,
    model,
    models: modelItems,
    reasoningEffort,
    selectGroup
  }
})
