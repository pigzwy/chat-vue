import { defineHandler, HTTPError } from 'nitro'

export default defineHandler(async () => {
  // SQL 投票写入已停用：前端直接更新 localStorage。
  throw new HTTPError({ statusCode: 410, statusMessage: 'Chat SQL storage is disabled' })
})
