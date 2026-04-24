import { defineHandler, HTTPError } from 'nitro'

export default defineHandler(async () => {
  // SQL 删除会话已停用：聊天删除只更新浏览器 localStorage。
  throw new HTTPError({ statusCode: 410, statusMessage: 'Chat SQL storage is disabled' })
})
