import { defineHandler } from 'nitro'
import { getValidatedRouterParams } from 'nitro/h3'
import { useChatSession } from '../../../utils/session'
import { useDrizzle, tables, eq, and } from '../../../utils/drizzle'
import { z } from 'zod'


export default defineHandler(async (event) => {
  const session = await useChatSession(event)

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const db = useDrizzle()

  return await db.delete(tables.chats)
    .where(and(eq(tables.chats.id, id as string), eq(tables.chats.userId, session.id!)))
    .returning()
})
