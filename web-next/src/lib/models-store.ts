import { createStore } from './store'
import { MODELS } from './shared/models'
import { isMediaModelId } from './shared/media-models'
import { loadAppConfig, resolveMediaGroupId } from './runtime-config'
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
  /** 是否已完成初始 token 校验（用于登录门:false=校验中显示骨架,true=可判定登录态） */
  authChecked: boolean
  /** sk 直连模式的手填 API Key(非空即处于该模式,跳过 JWT/分组体系) */
  manualKey: string
  /** 可选分组密钥:image-2 / Grok / Nano Banana 各一把,未配则回落 manualKey */
  manualImageKey: string
  manualGrokKey: string
  manualNanoKey: string
  /** 网关连通性(顶栏呼吸灯):ok=凭证有效,down=断开/凭证失效,unknown=未检测 */
  connection: 'ok' | 'down' | 'unknown'
  connectionDetail: string
  /** 网关账户余额(JWT 模式随心跳刷新;sk 模式/未知为 null) */
  balanceUsd: number | null
  /** 网关账户用户名(随 profile 心跳更新) */
  userName: string
}

const TOKEN_KEY = 'sub2api-token'
const GROUP_KEY = 'sub2api-group'
const MODEL_KEY = 'model'
const EFFORT_KEY = 'reasoning-effort'
const API_KEY_KEY = 'sub2api-api-key'
const API_KEYS_KEY = 'sub2api-api-keys'
const GROUPS_CACHE_KEY = 'sub2api-groups-cache'
const MODELS_CACHE_KEY = 'sub2api-models-cache-v2'
/** sk 直连模式:用户手填的 API Key(绕过 JWT 会话绑定;网关 sk 认证无指纹校验) */
const MANUAL_KEY_KEY = 'sub2api-manual-key'
/** 账号密码登录的会话续签:refresh token + access token 过期时间戳(ms) */
const REFRESH_KEY = 'sub2api-refresh-token'
const EXPIRES_AT_KEY = 'sub2api-token-expires-at'
/** 分组密钥(可选):image-2 / Grok / Nano Banana 各自的 key,创作台按模型自动路由 */
const MANUAL_IMAGE_KEY_KEY = 'sub2api-manual-key-image'
const MANUAL_GROK_KEY_KEY = 'sub2api-manual-key-grok'
const MANUAL_NANO_KEY_KEY = 'sub2api-manual-key-nanobanana'
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

function humanizeGatewayMessage(message: string) {
  if (message === 'Token has expired') return 'Token失效 请从主网站重新登录'
  if (/network fingerprint changed/i.test(message)) {
    return '登录环境与 Token 不匹配,该会话已被网关注销。请到 sub2.pigcode.com 重新登录,并在同一浏览器里粘贴新 Token'
  }
  return message
}

function toErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (!message) return defaultErrorMessage
  try {
    const parsed = JSON.parse(message)
    return humanizeGatewayMessage(parsed.message || parsed.error?.message || message)
  } catch {
    return humanizeGatewayMessage(message)
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
  error: '',
  authChecked: false,
  manualKey: '',
  manualImageKey: '',
  manualGrokKey: '',
  manualNanoKey: '',
  connection: 'unknown',
  connectionDetail: '连接状态检测中…',
  balanceUsd: null,
  userName: ''
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

  // 服务端注入的分组配置尽早拉取(登录流程后面会用到分组 id 路由)
  void loadAppConfig()

  patch({
    token,
    manualImageKey: readString(MANUAL_IMAGE_KEY_KEY),
    manualGrokKey: readString(MANUAL_GROK_KEY_KEY),
    manualNanoKey: readString(MANUAL_NANO_KEY_KEY),
    group: readJson<number | null>(GROUP_KEY, null),
    model: readString(MODEL_KEY, 'anthropic/claude-haiku-4.5'),
    reasoningEffort: readString(EFFORT_KEY, 'auto') as ReasoningEffort,
    apiKey: readString(API_KEY_KEY, '')
  })

  // sk 直连模式:有手填密钥则复验后直接进入(优先于 JWT)
  const manualKey = readString(MANUAL_KEY_KEY)
  if (manualKey) {
    try {
      await loginWithApiKey(manualKey)
    } catch (error) {
      writeString(MANUAL_KEY_KEY, '')
      patch({ authChecked: true, error: toErrorMessage(error) })
    }
    return
  }

  if (!token) {
    patch({ authChecked: true })
    return
  }

  // 密码登录的会话:access token 已过期/临期时先静默续签,再进校验
  const expiresAt = Number(readString(EXPIRES_AT_KEY))
  if (readString(REFRESH_KEY) && Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt - Date.now() < 120_000) {
    if (await refreshGatewaySession()) token = readString(TOKEN_KEY)
  }
  scheduleTokenRefresh()

  // 校验已存 token:失效则清掉,让登录门回落到登录页(而不是带着死 token 进应用)
  const result = await validateToken(token)
  if (!result.ok) {
    logout()
    patch({ authChecked: true, error: result.message })
    return
  }
  patch({ authChecked: true })
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
  const { token, manualKey } = modelsStore.get()
  // sk 直连模式:按分组路由到对应密钥(image/grok 未配则回落主密钥)
  if (manualKey) return manualKeyForGroup(groupId)
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

/** 三个媒体分组的当前 id(localStorage 覆盖 > 服务端配置 > 内置默认;nanobanana 0=未配置) */
export function mediaGroupIds() {
  return {
    openai: resolveMediaGroupId('openai'),
    grok: resolveMediaGroupId('grok'),
    nanobanana: resolveMediaGroupId('nanobanana')
  }
}

/** sk 模式:按分组路由到对应密钥(image-2→图片密钥,Grok→Grok 密钥,Nano Banana→香蕉密钥,未配回落主密钥) */
export function manualKeyForGroup(groupId: number) {
  const { manualKey, manualImageKey, manualGrokKey, manualNanoKey } = modelsStore.get()
  const ids = mediaGroupIds()
  if (groupId === ids.grok) return manualGrokKey || manualKey
  if (groupId === ids.openai) return manualImageKey || manualKey
  if (ids.nanobanana && groupId === ids.nanobanana) return manualNanoKey || manualKey
  return manualKey
}

/** 校验一把 sk(拉 /v1/models),返回模型列表;失败抛可读错误 */
async function validateApiKey(key: string) {
  const response = await fetch('/sub2api/v1/models', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = `密钥校验失败（${response.status}）`
    try {
      const parsed = JSON.parse(text)
      message = parsed.error?.message || parsed.message || message
    } catch { /* 保留默认 */ }
    throw new Error(toErrorMessage(new Error(message)))
  }
  return getItems<ModelItem>(await response.json()).map(toModelSelectItem)
}

/** 保存分组密钥(空串=清除;非空校验后落盘)。返回是否有变更 */
export async function setManualMediaKeys(keys: { image?: string, grok?: string, nanobanana?: string }) {
  const patchState: Partial<ModelsState> = {}
  if (keys.image !== undefined) {
    const key = keys.image.trim().replace(/^Bearer\s+/i, '')
    if (key) await validateApiKey(key)
    writeString(MANUAL_IMAGE_KEY_KEY, key)
    patchState.manualImageKey = key
  }
  if (keys.grok !== undefined) {
    const key = keys.grok.trim().replace(/^Bearer\s+/i, '')
    if (key) await validateApiKey(key)
    writeString(MANUAL_GROK_KEY_KEY, key)
    patchState.manualGrokKey = key
  }
  if (keys.nanobanana !== undefined) {
    const key = keys.nanobanana.trim().replace(/^Bearer\s+/i, '')
    if (key) await validateApiKey(key)
    writeString(MANUAL_NANO_KEY_KEY, key)
    patchState.manualNanoKey = key
  }
  if (Object.keys(patchState).length) {
    // 分组密钥变了,按分组的模型缓存指纹随之失效(fingerprint=该组实际用的 key)
    patch(patchState)
  }
  return Object.keys(patchState).length > 0
}

export function hasSub2apiToken() {
  const state = modelsStore.get()
  return Boolean(state.token || state.manualKey)
}

// ==================== 账号密码登录 + 静默续签(网关公开 auth API,全程走 /sub2api 代理) ====================

interface GatewayAuthPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  pending_auth_token?: string
}

/** 网关响应统一 {code,message,data} 包裹,兼容裸结构 */
function unwrapGatewayData<T>(parsed: unknown): T | null {
  if (!parsed || typeof parsed !== 'object') return null
  const wrapper = parsed as { data?: T }
  return (wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : parsed) as T
}

let refreshTimer: number | null = null

function persistSession(access: string, refresh?: string, expiresIn?: number) {
  writeString(TOKEN_KEY, access)
  if (refresh) writeString(REFRESH_KEY, refresh)
  writeString(EXPIRES_AT_KEY, expiresIn ? String(Date.now() + expiresIn * 1000) : '')
  patch({ token: access })
  scheduleTokenRefresh()
}

/** 在过期前 2 分钟静默续签;无 refresh token 或无过期信息则不排程 */
export function scheduleTokenRefresh() {
  if (typeof window === 'undefined') return
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = null
  if (!readString(REFRESH_KEY)) return
  const expiresAt = Number(readString(EXPIRES_AT_KEY))
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return
  const delay = Math.max(expiresAt - Date.now() - 120_000, 30_000)
  refreshTimer = window.setTimeout(() => { void refreshGatewaySession() }, delay)
}

/** 用 refresh token 换新 access token;成功返回 true 并重新排程 */
export async function refreshGatewaySession(): Promise<boolean> {
  const refreshToken = readString(REFRESH_KEY)
  if (!refreshToken) return false
  try {
    const response = await fetch('/sub2api/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [csrfHeaderName]: getCsrfToken() },
      body: JSON.stringify({ refresh_token: refreshToken })
    })
    if (!response.ok) return false
    const payload = unwrapGatewayData<GatewayAuthPayload>(await response.json().catch(() => null))
    if (!payload?.access_token) return false
    persistSession(payload.access_token, payload.refresh_token, payload.expires_in)
    return true
  } catch {
    return false
  }
}

/** 账号密码登录网关(Turnstile 开启时需带人机验证 token),成功后走既有 JWT 流程 */
export async function loginWithPassword(email: string, password: string, turnstileToken?: string) {
  const response = await fetch('/sub2api/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [csrfHeaderName]: getCsrfToken() },
    body: JSON.stringify({
      email,
      password,
      ...(turnstileToken ? { turnstile_token: turnstileToken } : {})
    })
  })
  const parsed = await response.json().catch(() => null) as { message?: string } | null
  if (!response.ok) {
    throw new Error(toErrorMessage(new Error(parsed?.message || `登录失败(${response.status})`)))
  }
  const payload = unwrapGatewayData<GatewayAuthPayload>(parsed)
  if (!payload?.access_token) {
    throw new Error(payload?.pending_auth_token
      ? '该账号开启了两步验证,暂请在网关侧登录使用'
      : (parsed?.message || '登录失败,请重试'))
  }
  persistSession(payload.access_token, payload.refresh_token, payload.expires_in)
  await login(payload.access_token)
}

/** 轻量连通性探测(顶栏呼吸灯用):用当前凭证打一次网关,60s 周期 + 窗口聚焦时触发。
 *  JWT 模式打 profile 接口,一次调用同时拿到余额 */
export async function checkConnection() {
  const { token, manualKey } = modelsStore.get()
  const credential = manualKey || token
  if (!credential) {
    patch({ connection: 'down', connectionDetail: '未登录', balanceUsd: null })
    return
  }
  try {
    const path = manualKey ? '/sub2api/v1/models' : '/sub2api/api/v1/user/profile'
    const response = await fetch(path, { headers: { Authorization: `Bearer ${credential}` } })
    if (response.ok) {
      let balanceUsd: number | null = null
      let userName = ''
      if (!manualKey) {
        const parsed = await response.json().catch(() => null) as { data?: Record<string, unknown> } | Record<string, unknown> | null
        const profile = (parsed && 'data' in (parsed as object) && (parsed as { data?: unknown }).data
          ? (parsed as { data: Record<string, unknown> }).data
          : parsed) as Record<string, unknown> | null
        const balance = profile?.balance
        balanceUsd = typeof balance === 'number' && Number.isFinite(balance) ? balance : null
        userName = typeof profile?.username === 'string' ? profile.username : ''
      }
      patch({
        connection: 'ok',
        connectionDetail: manualKey ? '已连接(API Key 有效)' : '已连接(会话有效)',
        balanceUsd,
        userName
      })
    } else if (response.status === 401 || response.status === 403) {
      // 密码登录的会话先尝试静默续签,成功则立即恢复绿灯
      if (!manualKey && await refreshGatewaySession()) {
        patch({ connection: 'ok', connectionDetail: '已连接(会话已续期)' })
        return
      }
      patch({ connection: 'down', connectionDetail: '已断开:凭证失效,请重新登录', balanceUsd: null })
    } else {
      patch({ connection: 'down', connectionDetail: `已断开:网关异常(${response.status})` })
    }
  } catch {
    patch({ connection: 'down', connectionDetail: '已断开:网关不可达' })
  }
}

/** 校验 sub2.pigcode.com 会话 JWT：能拉到分组即视为有效 */
async function validateToken(token: string) {
  const response = await fetch('/sub2api/api/v1/groups/available', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (response.ok) return { ok: true as const }
  const text = await response.text().catch(() => '')
  let message = `校验失败（${response.status}）`
  try {
    const parsed = JSON.parse(text)
    message = parsed.message || parsed.error?.message || message
  } catch { /* 保留默认 */ }
  // toErrorMessage 只认 Error 实例,传字符串会吞掉真实报错(曾把网关会话绑定报错显示成通用失败)
  return { ok: false as const, status: response.status, message: toErrorMessage(new Error(message)) }
}

/** sk 直连登录：校验 API Key(拉 /v1/models)后进入,跳过 JWT/分组体系。
 *  网关对 sk 无会话指纹校验,不受 SESSION_BINDING 影响。 */
export async function loginWithApiKey(rawKey: string) {
  const key = rawKey.trim().replace(/^Bearer\s+/i, '')
  if (!key) throw new Error('请输入 API Key(sk- 开头)')

  patch({ loading: true })
  try {
    const response = await fetch('/sub2api/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let message = `密钥校验失败（${response.status}）`
      try {
        const parsed = JSON.parse(text)
        message = parsed.error?.message || parsed.message || message
      } catch { /* 保留默认 */ }
      throw new Error(toErrorMessage(new Error(message)))
    }
    const allItems = getItems<ModelItem>(await response.json()).map(toModelSelectItem)
    if (!allItems.length) throw new Error('该密钥下没有可用模型')

    writeString(MANUAL_KEY_KEY, key)
    writeString(API_KEY_KEY, key)
    writeJson(MODELS_CACHE_KEY, { manual: { token: key, items: allItems } })

    const models = toChatModels(allItems)
    let model = modelsStore.get().model
    if (!models.some(item => item.value === model)) {
      model = models[0]?.value || ''
      writeString(MODEL_KEY, model)
    }
    patch({
      manualKey: key,
      apiKey: key,
      token: '',
      groups: [],
      group: null,
      models,
      model,
      error: '',
      authChecked: true
    })
  } finally {
    patch({ loading: false })
  }
}

/** 登录：校验 JWT 有效后写入 token 并加载分组/模型；失败抛出可读错误，不落盘 */
export async function login(rawToken: string) {
  const token = rawToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('请输入 sub2.pigcode.com 的登录 Token')

  const result = await validateToken(token)
  if (!result.ok) throw new Error(result.message)

  // 换号登录清掉上一个账号的分组/模型/key 缓存
  if (token !== modelsStore.get().token) {
    writeJson(GROUPS_CACHE_KEY, null)
    writeJson(MODELS_CACHE_KEY, {})
    writeJson(API_KEYS_KEY, {})
    writeString(API_KEY_KEY, '')
  }
  writeString(TOKEN_KEY, token)
  patch({ token, error: '' })
  await loadGroups()
}

/** 退出登录：清 token/手填密钥 与全部账号相关缓存，回到登录页 */
export function logout() {
  writeString(TOKEN_KEY, '')
  writeString(REFRESH_KEY, '')
  writeString(EXPIRES_AT_KEY, '')
  if (typeof window !== 'undefined' && refreshTimer) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }
  writeString(MANUAL_KEY_KEY, '')
  writeString(MANUAL_IMAGE_KEY_KEY, '')
  writeString(MANUAL_GROK_KEY_KEY, '')
  writeString(MANUAL_NANO_KEY_KEY, '')
  writeJson(GROUPS_CACHE_KEY, null)
  writeJson(MODELS_CACHE_KEY, {})
  writeJson(API_KEYS_KEY, {})
  writeString(API_KEY_KEY, '')
  writeJson(GROUP_KEY, null)
  patch({ token: '', manualKey: '', manualImageKey: '', manualGrokKey: '', manualNanoKey: '', group: null, groups: [], models: MODELS, apiKey: '', error: '', connection: 'unknown', connectionDetail: '连接状态检测中…', balanceUsd: null, userName: '' })
}

/** 拉取指定分组的模型列表（带缓存；会按需自动创建该分组的 key）——创作台用。
 *  sk 直连模式同样生效:凭证指纹用 manualKey,各分组返回的都是该 key 分组的真实列表 */
export async function getModelsForGroup(groupId: number, keyName = 'chat'): Promise<ModelSelectItem[]> {
  const { token, manualKey } = modelsStore.get()
  const credential = manualKey ? manualKeyForGroup(groupId) : token
  if (!credential) return []

  const cacheKey = String(groupId)
  const cache = readJson<Record<string, ModelsCacheItem>>(MODELS_CACHE_KEY, {})
  const cached = cache[cacheKey]
  if (cached?.token === credential && cached.items.length) {
    return cached.items
  }

  const groupApiKey = await getApiKeyForGroup(groupId, keyName)
  const response = await sub2apiFetch<unknown>('/v1/models', groupApiKey)
  const items = getItems<ModelItem>(response).map(toModelSelectItem)
  if (items.length) {
    writeJson(MODELS_CACHE_KEY, { ...cache, [cacheKey]: { token: credential, items } })
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
