# Sub2API 对接保留说明

这个项目当前已经不适合作为继续开发基线。后续应重新拉取上游 `chat-vue` 代码，再把本文档中的 Sub2API 对接逻辑移植回去。

本文只保留一件事：如何从纯前端接入 Sub2API。不要按本文做页面设计、布局改造、Playground 页面规划或旧后端清理方案。

---

## 目标

重新拉上游代码后，保留并迁移以下能力：

1. 从 URL 读取 Sub2API JWT。
2. 用 JWT 调 Sub2API 用户接口。
3. 获取用户可用分组。
4. 为分组获取或创建 API Key。
5. 用 API Key 获取模型列表。
6. 用 API Key 调 OpenAI 兼容 `/v1/chat/completions`，支持 `stream: true`。

不在本文范围内：

1. 页面布局设计。
2. Playground 独立页面。
3. 聊天 UI 重构。
4. 数据库、OAuth、CSRF、分享、投票、工具调用等上游功能取舍。

---

## 请求代理

前端统一请求 `/sub2api`，开发环境由 Vite 代理到真实 Sub2API 服务。

```ts
// vite.config.ts
server: {
  proxy: {
    '/sub2api': {
      target: env.VITE_SUB2API_BASE_URL,
      changeOrigin: true,
      rewrite: path => path.replace(/^\/sub2api/, ''),
    },
  },
}
```

环境变量：

```bash
VITE_SUB2API_BASE_URL=https://your-sub2api-domain.com
```

生产环境也需要在 Nginx/Caddy/网关中配置等价反向代理。

---

## 接口流程

```text
URL token
  -> GET /api/v1/auth/me
  -> GET /api/v1/groups/available
  -> 用户选择 group
  -> GET /api/v1/keys?group_id=<groupId>
  -> 如无可用 key，POST /api/v1/keys 创建
  -> GET /v1/models
  -> POST /v1/chat/completions stream=true
```

鉴权分两类：

```text
Sub2API 管理接口：Authorization: Bearer <JWT>
OpenAI 兼容网关：Authorization: Bearer <API-Key>
```

---

## 建议保留的文件结构

```text
src/api/sub2api.ts
src/api/sub2apiClient.ts
src/api/sub2apiResources.ts
src/api/sub2apiChat.ts
src/api/sub2apiTypes.ts
```

`src/api/sub2api.ts` 只作为统一出口，调用方继续从这里导入：

```ts
export type {
  ApiKeyItem,
  AuthUser,
  ChatCompletionMessage,
  GroupItem,
  ModelItem,
} from './sub2apiTypes'

export { createApiKey, getApiKeys, getAvailableGroups, getMe, getModels } from './sub2apiResources'
export { chatStream } from './sub2apiChat'
export type { ChatStreamOptions } from './sub2apiChat'
```

这样后续页面、store、composable 不需要知道底层文件如何拆分。

---

## 基础 Client

```ts
// src/api/sub2apiClient.ts
const SUB2API_BASE_URL = '/sub2api'

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUB2API_BASE_URL}${path}`, options)
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res))
  }
  return res.json()
}

export function sub2apiUrl(path: string): string {
  return `${SUB2API_BASE_URL}${path}`
}

export async function responseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `请求失败: ${res.status}`

  try {
    const parsed = JSON.parse(text)
    return parsed.error?.message || parsed.message || text
  } catch {
    return text
  }
}
```

---

## 类型定义

```ts
// src/api/sub2apiTypes.ts
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface AuthUser {
  id: number
  email: string
  username: string
  role: string
  balance: number
  avatar_url?: string
}

export interface GroupItem {
  id: number
  name: string
  description: string
  platform: string
  status: string
}

export interface ApiKeyItem {
  id: number
  key: string
  name: string
  group_id: number | null
  status: string
  group?: GroupItem | null
}

export interface ModelItem {
  id: string
  display_name?: string
}

export interface ModelsResponse {
  object: string
  data: ModelItem[]
}

export interface ChatCompletionMessage {
  role: string
  content: string
}
```

---

## 管理接口封装

```ts
// src/api/sub2apiResources.ts
import { authHeaders, requestJson } from './sub2apiClient'
import type {
  ApiKeyItem,
  ApiResponse,
  AuthUser,
  GroupItem,
  ModelItem,
  ModelsResponse,
  PaginatedData,
} from './sub2apiTypes'

export async function getMe(jwt: string): Promise<AuthUser> {
  const res = await requestJson<ApiResponse<AuthUser>>('/api/v1/auth/me', {
    headers: authHeaders(jwt),
  })
  return res.data
}

export async function getAvailableGroups(jwt: string): Promise<GroupItem[]> {
  const res = await requestJson<ApiResponse<GroupItem[]>>('/api/v1/groups/available', {
    headers: authHeaders(jwt),
  })
  return res.data
}

export async function getApiKeys(jwt: string, groupId?: number): Promise<ApiKeyItem[]> {
  const params = new URLSearchParams({
    page: '1',
    page_size: '100',
  })
  if (groupId !== undefined) {
    params.set('group_id', String(groupId))
  }

  const res = await requestJson<ApiResponse<PaginatedData<ApiKeyItem>>>(`/api/v1/keys?${params}`, {
    headers: authHeaders(jwt),
  })
  return res.data.items
}

export async function createApiKey(jwt: string, name: string, groupId: number): Promise<ApiKeyItem> {
  const res = await requestJson<ApiResponse<ApiKeyItem>>('/api/v1/keys', {
    method: 'POST',
    headers: { ...authHeaders(jwt), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, group_id: groupId }),
  })
  return res.data
}

export async function getModels(apiKey: string): Promise<ModelItem[]> {
  const res = await requestJson<ModelsResponse>('/v1/models', {
    headers: authHeaders(apiKey),
  })
  return res.data
}
```

---

## 流式聊天封装

```ts
// src/api/sub2apiChat.ts
import { authHeaders, responseErrorMessage, sub2apiUrl } from './sub2apiClient'
import type { ChatCompletionMessage } from './sub2apiTypes'

export interface ChatStreamOptions {
  apiKey: string
  model: string
  messages: ChatCompletionMessage[]
  temperature: number
  top_p: number
  max_tokens: number
  signal?: AbortSignal
  onDelta: (content: string) => void
  onDone: () => void
  onError: (message: string) => void
}

export async function chatStream(options: ChatStreamOptions) {
  const res = await fetch(sub2apiUrl('/v1/chat/completions'), {
    method: 'POST',
    headers: {
      ...authHeaders(options.apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      stream: true,
    }),
    signal: options.signal,
  })

  if (!res.ok) {
    options.onError(await responseErrorMessage(res))
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    options.onError('无法读取响应流')
    return
  }

  await readChatStream(reader, options.onDelta)
  options.onDone()
}

async function readChatStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (content: string) => void
) {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) return

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (handleStreamLine(line, onDelta)) return
    }
  }
}

function handleStreamLine(line: string, onDelta: (content: string) => void): boolean {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('data: ')) return false

  const data = trimmed.slice(6)
  if (data === '[DONE]') return true

  try {
    const parsed = JSON.parse(data)
    const delta = parsed.choices?.[0]?.delta?.content
    if (delta) onDelta(delta)
  } catch {
    // 忽略单行解析失败，后续分片仍可继续解析。
  }

  return false
}
```

---

## Token 初始化

重新拉上游后，只需要在应用入口或 layout 中读取 URL 参数：

```ts
const url = new URL(window.location.href)
const token = url.searchParams.get('token')
const theme = url.searchParams.get('theme')

if (theme === 'dark') {
  document.documentElement.classList.add('dark')
} else if (theme === 'light') {
  document.documentElement.classList.remove('dark')
}

if (token) {
  await auth.init(token)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}
```

`auth.init(token)` 的核心逻辑：

```ts
import { getMe } from '../api/sub2api'

async function init(token: string) {
  jwt.value = token
  user.value = await getMe(token)
}
```

---

## 分组、Key、模型初始化

最小流程：

```ts
import { createApiKey, getApiKeys, getAvailableGroups, getModels } from '../api/sub2api'

async function initSub2apiSession(jwt: string, groupId?: number) {
  const groups = await getAvailableGroups(jwt)
  const activeGroupId = groupId ?? groups[0]?.id
  if (!activeGroupId) throw new Error('没有可用分组')

  const keys = await getApiKeys(jwt, activeGroupId)
  const activeKey = keys.find(key => key.status === 'active')
  const apiKey = activeKey?.key ?? (await createApiKey(jwt, `playground-${activeGroupId}`, activeGroupId)).key

  const models = await getModels(apiKey)

  return {
    groups,
    activeGroupId,
    apiKey,
    models,
    selectedModel: models[0]?.id || '',
  }
}
```

---

## 发送消息

调用 `chatStream` 时传入 OpenAI 格式消息：

```ts
import { chatStream } from '../api/sub2api'

await chatStream({
  apiKey,
  model: selectedModel,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ].filter(message => message.content),
  temperature: 0.7,
  top_p: 1,
  max_tokens: 2048,
  signal: abortController.signal,
  onDelta(content) {
    assistantText += content
  },
  onDone() {
    // 标记完成
  },
  onError(message) {
    // 显示错误
  },
})
```

停止生成：

```ts
const abortController = new AbortController()
abortController.abort()
```

---

## 重新开发时的迁移顺序

1. 重新拉取上游 `chat-vue`。
2. 配置 `/sub2api` proxy。
3. 复制 `src/api/sub2api*.ts`。
4. 在入口或 layout 中读取 `token`，调用 `getMe`。
5. 在需要模型选择的位置调用：`getAvailableGroups -> getApiKeys/createApiKey -> getModels`。
6. 替换原聊天发送逻辑，改为 `chatStream`。
7. 保持 UI 使用上游原结构，先不要做页面重构。

---

## 当前项目里值得保留的代码

只建议保留这些 Sub2API 对接相关代码：

```text
src/api/sub2api.ts
src/api/sub2apiClient.ts
src/api/sub2apiResources.ts
src/api/sub2apiChat.ts
src/api/sub2apiTypes.ts
src/stores/auth.ts
src/composables/useChatStream.ts
```

`src/stores/playground.ts` 里也有分组、Key、模型初始化逻辑，但它混合了本地会话和页面状态。重新开发时可以只参考其中这几个函数的思路：

```text
initGroups
switchGroup
ensureApiKeyForGroup
```
