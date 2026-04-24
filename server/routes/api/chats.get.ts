import { defineHandler } from 'nitro'
import { useChatSession } from '../../utils/session'
import { useDrizzle, tables, eq } from '../../utils/drizzle'

export default defineHandler(async (event) => {
  const session = await useChatSession(event)

  return (await useDrizzle().select().from(tables.chats).where(eq(tables.chats.userId, session.id!))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
})
