import { defineHandler, HTTPError } from 'nitro'
import { getQuery, getRequestHeader } from 'nitro/h3'
import { getRecentMediaErrors } from '../../../utils/mediaErrorLog'

/**
 * 最近媒体任务错误（内存最近 200 条；完整历史见 .data/media-errors.jsonl）。
 * 需配置 ADMIN_LOG_KEY 环境变量并以 x-admin-key 请求头携带，未配置时该接口关闭。
 */
export default defineHandler((event) => {
  const adminKey = process.env.ADMIN_LOG_KEY
  if (!adminKey || getRequestHeader(event, 'x-admin-key') !== adminKey) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const limit = Number(getQuery(event).limit) || 50
  return { items: getRecentMediaErrors(limit) }
})
