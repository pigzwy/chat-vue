# Chat Vue Sub2API

基于 `nuxt-ui-templates/chat-vue` 精简后的对话应用，保留聊天、历史记录、思考展示、复制、点赞、重试等核心能力，并接入 Sub2API 的分组和模型选择。

## 功能

- Sub2API 分组选择和分组下模型选择
- OpenAI-compatible `/v1/chat/completions` 流式对话
- SQLite/Turso 持久化聊天记录
- AI SDK UI 消息流、reasoning 展示和消息操作
- 匿名 session 隔离本机聊天记录

## 当前限制

- 暂不支持在界面中切换模型思考强度。内置模型的 reasoning/thinking 参数由服务端固定配置，Sub2API 模型请求暂不附加思考强度参数。
- 聊天窗口暂不支持上传文件或图片作为消息附件。
- `/images` 页面目前是图片生成任务界面原型，可选择图片质量、画幅并添加本地 JPG/PNG 文件，但尚未接入实际上传、图片生成和结果下载接口。

## 环境变量

```bash
SESSION_SECRET=<minimum-32-characters>
VITE_SUB2API_BASE_URL=https://your-sub2api-domain.com
SUB2API_BASE_URL=https://your-sub2api-domain.com
AI_GATEWAY_API_KEY=<optional-fallback-key>
TURSO_DATABASE_URL=<production-only>
TURSO_AUTH_TOKEN=<production-only>
```

`SESSION_SECRET` 仍然必需，用于匿名 session cookie。项目不再包含第三方登录。

## 开发

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

访问：

```text
http://localhost:3000/?token=<sub2api-jwt>
```

页面会保存 token，加载可用分组，并根据分组加载模型。

## 构建

```bash
pnpm build
pnpm preview
```
