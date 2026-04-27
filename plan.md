# 图片生成异步化方案

## 背景

线上图片生成偶尔超过 125 秒时会出现 524。根因不是前端 300 秒超时，而是生产链路存在外层网关或代理会切断长时间无数据返回的 HTTP 请求。本地没有这层限制，所以可以等待更久。

在不能修改 sub2api、不能调整 Cloudflare 或外层网关的前提下，最稳方案是在 chat-vue 内部把图片生成改成异步任务。

## 目标

把当前“前端请求一直等待图片生成完成”的链路改成：

1. 前端提交图片生成请求。
2. chat-vue 立即创建任务并返回 `jobId`。
3. chat-vue 服务端后台继续调用 sub2api。
4. 前端定时轮询任务状态。
5. 任务完成后前端拿到图片并更新卡片。

这样浏览器面对的都是短请求，不再受 125 秒长请求限制影响。

## 最小实现范围

- 只处理文生图任务。
- 暂不引入数据库、Redis 或任务后台管理。
- 服务端使用内存 `Map` 保存任务。
- 容器重启后进行中的任务允许丢失。
- 继续保留当前 localStorage 图片历史。
- 保留现有流式请求兼容逻辑，但异步任务不依赖流式成功。

## 服务端设计

新增 `server/utils/imageJobs.ts`：

- `createImageJob(input)`：创建任务，返回 `jobId`。
- `getImageJob(id)`：查询任务。
- `runImageJob(id)`：后台执行 sub2api 图片生成。
- `cleanupImageJobs()`：定期清理旧任务，避免内存无限增长。

任务状态：

```ts
type ImageJobStatus = 'queued' | 'running' | 'completed' | 'error'
```

任务数据：

```ts
interface ImageJob {
  id: string
  status: ImageJobStatus
  apiKey: string
  prompt: string
  ratio: ImageRatio
  resolution: ImageResolution
  size: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  data?: ImageGenerationResponse['data']
}
```

新增接口：

- `POST /api/images/jobs`
  - 校验参数。
  - 创建 job。
  - 立即返回 `{ id, status, createdAt }`。
  - 后台开始执行图片生成。

- `GET /api/images/jobs/:id`
  - 返回任务状态。
  - 完成时返回图片数据。
  - 失败时返回错误信息。

## 前端设计

当前图片卡片继续使用 `ImageTask`。

增加字段：

```ts
jobId?: string
completedAt?: Date
```

提交逻辑调整：

1. 创建本地 `ImageTask`，状态为 `generating`。
2. 请求 `POST /api/images/jobs`。
3. 保存返回的 `jobId` 到本地任务。
4. 每 2 到 3 秒轮询 `GET /api/images/jobs/:id`。
5. 状态为 `completed` 时写入 `imageUrl`、`revisedPrompt`、`durationSeconds`、`completedAt`。
6. 状态为 `error` 时写入错误并停止轮询。

刷新恢复：

- 页面加载时扫描 localStorage。
- 如果存在 `status === 'generating' && jobId`，继续轮询。
- 如果查询不到 job，标记为失败并提示“任务已失效，请重试”。

## 验收标准

- 生成耗时超过 125 秒时，前端页面不会因为单个长请求 524 而失败。
- 前端刷新后，已有 `jobId` 的进行中任务能继续查询状态。
- 成功任务仍保存到 localStorage，刷新后图片历史不丢失。
- 失败任务能显示错误信息，并支持重试。
- `pnpm typecheck` 通过。
- `pnpm build` 通过。

## 风险与后续

- 内存任务在容器重启后会丢失，这是最小实现的已知取舍。
- 多副本部署时，轮询可能打到不同实例，内存 Map 会失效；如果后续上多副本，需要改为 Redis、SQLite 或共享存储。
- 图片编辑任务也可能超时，第一阶段先解决文生图；验证稳定后再按同样模式迁移编辑图。
