import { defineHandler } from 'nitro'
import { readValidatedBody } from 'nitro/h3'
import { z } from 'zod'
import { queryMediaHistory } from '../../../utils/mediaHistory'

/**
 * 账号级生成历史查询:客户端提交它手上的全部 API Key(sk 模式的手填 key /
 * JWT 模式各分组自动建的 key),服务端逐把哈希取并集返回。
 * "持有 key 即可见对应历史";key 明文不落库、不回显。
 */
export default defineHandler(async (event) => {
  const { apiKeys, limit, before } = await readValidatedBody(event, z.object({
    apiKeys: z.array(z.string().trim().min(20).max(256)).min(1).max(10),
    limit: z.number().int().min(1).max(200).optional(),
    before: z.number().int().positive().optional()
  }).parse)

  const items = await queryMediaHistory({ apiKeys, limit, before })
  return {
    items: items.map(item => ({
      id: item.id,
      kind: item.kind,
      model: item.model,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      expiresAt: item.expiresAt,
      costUsd: item.costUsd,
      createdAt: item.createdAt
    }))
  }
})
