import { defineHandler, HTTPError } from 'nitro'
import { readValidatedBody } from 'nitro/h3'
import { z } from 'zod'
import type { UIMessage } from 'ai'
import { useChatSession } from '../../utils/session'
import { useDrizzle, tables } from '../../utils/drizzle'

export default defineHandler(async (event) => {
  const session = await useChatSession(event)

  const { input, parts } = await readValidatedBody(event, z.object({
    input: z.string(),
    parts: z.array(z.custom<UIMessage['parts'][number]>()).optional()
  }).parse)
  if (!parts?.length && !input.trim()) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Message is required' })
  }
  const messageParts = parts?.length ? parts : [{ type: 'text' as const, text: input }]

  const db = useDrizzle()

  const [chat] = await db.insert(tables.chats).values({
    title: '',
    userId: session.id!
  }).returning()
  if (!chat) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Failed to create chat' })
  }

  await db.insert(tables.messages).values({
    chatId: chat.id,
    role: 'user',
    parts: messageParts
  })

  return chat
})
