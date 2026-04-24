import { computed, onMounted, ref } from 'vue'
import { createSharedComposable, useStorage } from '@vueuse/core'
import { MODELS } from '../../shared/utils/models'
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

interface ModelItem {
  id: string
  display_name?: string
}

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

  localStorage.setItem(SUB2API_TOKEN_KEY, token)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  return token
}

export const useModels = createSharedComposable(() => {
  const token = useStorage(SUB2API_TOKEN_KEY, '')
  const group = useStorage<number | null>('sub2api-group', null)
  const model = useStorage<string>('model', 'anthropic/claude-haiku-4.5')
  const apiKey = useStorage('sub2api-api-key', '')
  const apiKeysByGroup = useStorage<Record<string, string>>('sub2api-api-keys', {})
  const groupItems = ref<Array<{ label: string, value: number, icon: string }>>([])
  const modelItems = ref(MODELS)
  const loading = ref(false)
  const error = ref('')
  const { csrf, headerName } = useCsrf()

  const hasSub2apiToken = computed(() => Boolean(token.value))

  async function init() {
    if (typeof window === 'undefined') return
    const urlToken = readTokenFromUrl()
    if (urlToken) token.value = urlToken
    if (!token.value) return

    await loadGroups()
  }

  async function loadGroups() {
    loading.value = true
    error.value = ''
    try {
      const response = await sub2apiFetch<unknown>('/api/v1/groups/available', token.value)
      groupItems.value = getItems<GroupItem>(response).map(item => ({
        label: item.name,
        value: item.id,
        icon: iconForProvider(item.platform || item.name)
      }))

      if (!groupItems.value.length) {
        throw new Error('没有可用分组')
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

    apiKey.value = await getApiKeyForGroup(groupId)

    const modelsResponse = await sub2apiFetch<unknown>('/v1/models', apiKey.value)
    modelItems.value = getItems<ModelItem>(modelsResponse).map(item => ({
      label: item.display_name || item.id,
      value: item.id,
      icon: iconForProvider(item.id)
    }))

    if (!modelItems.value.length) {
      throw new Error('没有可用模型')
    }

    if (!modelItems.value.some(item => item.value === model.value)) {
      model.value = modelItems.value[0]?.value || ''
    }
  }

  async function getApiKeyForGroup(groupId: number) {
    if (!token.value) {
      throw new Error('缺少 Sub2API token')
    }

    const cacheKey = String(groupId)
    if (apiKeysByGroup.value[cacheKey]) {
      return apiKeysByGroup.value[cacheKey]
    }

    const params = new URLSearchParams({
      page: '1',
      page_size: '100',
      group_id: String(groupId)
    })
    const keysResponse = await sub2apiFetch<unknown>(`/api/v1/keys?${params}`, token.value)
    const activeKey = getItems<ApiKeyItem>(keysResponse).find(key => key.status === 'active')
    const key = activeKey?.key || await createApiKey(groupId)
    apiKeysByGroup.value = {
      ...apiKeysByGroup.value,
      [cacheKey]: key
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

  async function createApiKey(groupId: number) {
    const response = await fetch('/sub2api/api/v1/keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.value}`,
        [headerName]: csrf(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `chat-vue-${groupId}`, group_id: groupId })
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
    selectGroup
  }
})
