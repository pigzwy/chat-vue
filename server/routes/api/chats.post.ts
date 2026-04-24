import { defineHandler, HTTPError } from 'nitro'

export default defineHandler(async () => {
  // SQL 新建会话已停用：请在前端 localStorage 创建聊天记录。
  throw new HTTPError({ statusCode: 410, statusMessage: 'Chat SQL storage is disabled' })
})
