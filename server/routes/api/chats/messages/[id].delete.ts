import { defineHandler, HTTPError } from 'nitro'

export default defineHandler(async () => {
  // SQL 消息裁剪已停用：编辑和重新生成时由前端 Chat 状态与 localStorage 处理。
  throw new HTTPError({ statusCode: 410, statusMessage: 'Chat SQL storage is disabled' })
})
