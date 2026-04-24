import { definePlugin } from 'nitro'

export default definePlugin(async () => {
  // SQL 聊天存储已停用，生产启动时不再创建/迁移 chats/messages/votes 表。
  // 对话数据改由浏览器 localStorage 保存，避免服务端依赖 libsql 原生包。
})
