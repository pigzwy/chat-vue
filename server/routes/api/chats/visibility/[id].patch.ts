import { defineHandler, HTTPError } from 'nitro'
import { getValidatedRouterParams, readValidatedBody } from 'nitro/h3'
import { useChatSession } from '../../../../utils/session'
import { useDrizzle, tables, eq, and } from '../../../../utils/drizzle'
import { z } from 'zod'


export default defineHandler(async (event) => {
  const session = await useChatSession(event)

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { visibility } = await readValidatedBody(event, z.object({
    visibility: z.enum(['public', 'private'])
  }).parse)

  const db = useDrizzle()

  const chat = await db.query.chats.findFirst({
    where: (chat) => and(
      eq(chat.id, id as string),
      eq(chat.userId, session.id!)
    )
  })

  if (!chat) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  const [updated] = await db.update(tables.chats)
    .set({ visibility })
    .where(and(
      eq(tables.chats.id, id as string),
      eq(tables.chats.userId, session.id!)
    ))
    .returning()

  if (!updated) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  return updated
})
