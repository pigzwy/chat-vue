import { defineHandler, HTTPError } from 'nitro'

export default defineHandler(async () => {
  // SQL 读取会话已停用：聊天详情由前端 localStorage 直接读取。
  throw new HTTPError({ statusCode: 410, statusMessage: 'Chat SQL storage is disabled' })
})
