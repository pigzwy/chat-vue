import { defineHandler, HTTPError } from 'nitro'
import { getValidatedRouterParams } from 'nitro/h3'
import { useChatSession } from '../../../utils/session'
import { useDrizzle } from '../../../utils/drizzle'
import { z } from 'zod'


export default defineHandler(async (event) => {
  const session = await useChatSession(event)

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const chat = await useDrizzle().query.chats.findFirst({
    where: (chat, { eq }) => eq(chat.id, id as string),
    with: {
      messages: {
        orderBy: (message, { asc }) => asc(message.createdAt)
      }
    }
  })

  if (!chat) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  const isOwner = chat.userId === session.id!

  if (chat.visibility === 'private' && !isOwner) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId: _, ...rest } = chat
  return { ...rest, isOwner }
})
