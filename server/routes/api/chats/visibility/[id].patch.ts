import { defineHandler, HTTPError } from 'nitro'

export default defineHandler(async () => {
  // SQL 公开/私有状态已停用：localStorage 聊天不再提供服务端共享可见性。
  throw new HTTPError({ statusCode: 410, statusMessage: 'Chat SQL storage is disabled' })
})
