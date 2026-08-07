# Chat Vue Sub2API

基于 `nuxt-ui-templates/chat-vue` 改造的 AI 工作台：玻璃拟态 UI，包含聊天、统一创作台（图片 + 视频生成）和案例观摩馆，接入 Sub2API 的分组和模型选择。

## 功能

- Sub2API 分组选择和分组下模型选择
- OpenAI-compatible `/v1/chat/completions` 流式对话，reasoning 展示和消息操作
- **创作台 `/studio`**：图片/视频统一入口
  - 图片：GPT Image 2（文生图 / 以图生图 / 编辑链），Grok Imagine 系列（`grok-imagine-image` / `grok-imagine-image-quality`）
  - 视频：Grok Imagine 视频（`grok-imagine-video` / `grok-imagine-video-1.5`），文生视频与图生视频，时长 5/10/15 秒
  - 任务队列：刷新恢复、批量下载/删除、编辑历史链、IndexedDB 本地持久化（图片）
- 案例观摩馆 `/gallery`：532 个公开案例，滚动渐进加载
- 聊天记录 localStorage 本地存储，按浏览器隔离

## 架构说明

- 图片/视频生成走「服务端任务 + 客户端轮询」模式：`POST /api/images/jobs`、`POST /api/videos/jobs` 创建任务，`GET /api/{images,videos}/jobs/:id` 轮询结果
- 视频上游为异步接口（Sub2API `/v1/videos/generations` → `request_id` → `/v1/videos/{request_id}` 轮询），服务端超时 20 分钟；图生视频源图以 `image_url`（base64 data URL）传给上游
- 上游视频地址是需带 key 的相对路径，由 `GET /api/videos/content/:id` 代理播放/下载
- 任务存储为进程内存（单副本部署；重启丢失进行中任务，视频代理地址随任务过期 2h 失效——请及时下载）
- 分组绑定：GPT Image 2 → 分组 25，Grok 全系 → 分组 66，各自自动创建名为 `chat | draw` 的 API key

## 当前限制

- 图片编辑（多参考图）仅 GPT Image 2 支持；Grok 图片模型走纯文生图
- Grok 图片/视频不支持 size/quality 参数，画幅以提示词尽力约束
- 聊天窗口的思考强度由服务端配置，Sub2API 模型请求暂不附加思考强度参数

## 环境变量

```bash
VITE_SUB2API_BASE_URL=https://your-sub2api-domain.com
SUB2API_BASE_URL=https://your-sub2api-domain.com
AI_GATEWAY_API_KEY=<optional-fallback-key>
```

## 开发

```bash
pnpm install
pnpm dev
```

访问：

```text
http://localhost:3000/?token=<sub2api-jwt>
```

页面会保存 token，加载可用分组，并根据分组加载模型。创作台默认使用分组 25（可在模型菜单中切换分组）。

## 构建

```bash
pnpm build
pnpm preview
```
