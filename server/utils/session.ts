import { useSession, type HTTPEvent, type Session } from 'nitro/h3'

export interface ChatSession extends Session {}

export function useChatSession (event: HTTPEvent) {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is not set')
  }
  return useSession<ChatSession>(event, {
    password: process.env.SESSION_SECRET
  })
}
