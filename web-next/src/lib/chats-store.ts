import type { UIMessage } from 'ai'
import { createStore } from './store'

const localChatsStorageKey = 'pigcode-local-chats'
/** 品牌改名前的旧键(pigcoder 时代),读到即一次性迁移,老用户会话不丢 */
const legacyChatsStorageKey = 'pigcoder-local-chats'

export interface LocalVote {
  chatId: string
  messageId: string
  isUpvoted: boolean
}

export interface LocalChatData {
  id: string
  title: string
  visibility: 'public' | 'private'
  createdAt: string
  updatedAt: string
  messages: UIMessage[]
  votes: LocalVote[]
  isOwner: boolean
}

export interface ChatListItem {
  id: string
  label: string
  href: string
  createdAt: string
}

export interface ChatGroup {
  id: string
  label: string
  items: ChatListItem[]
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function getTextFromParts(parts: UIMessage['parts']) {
  const textPart = parts.find(part => part.type === 'text')
  return textPart && 'text' in textPart ? textPart.text : ''
}

function getTitle(input: string, parts: UIMessage['parts']) {
  const text = (input || getTextFromParts(parts)).trim()
  return text ? text.slice(0, 30) : '附件对话'
}

function readStoredChats(): LocalChatData[] {
  if (typeof window === 'undefined') return []

  try {
    let raw = window.localStorage.getItem(localChatsStorageKey)
    if (!raw) {
      raw = window.localStorage.getItem(legacyChatsStorageKey)
      if (raw) window.localStorage.setItem(localChatsStorageKey, raw)
    }
    if (!raw) return []

    const parsed = JSON.parse(raw) as Partial<LocalChatData>[]
    return parsed.map(chat => ({
      id: chat.id || createId(),
      title: chat.title || 'Untitled',
      visibility: chat.visibility || 'private',
      createdAt: chat.createdAt || new Date().toISOString(),
      updatedAt: chat.updatedAt || chat.createdAt || new Date().toISOString(),
      messages: Array.isArray(chat.messages) ? chat.messages : [],
      votes: Array.isArray(chat.votes) ? chat.votes : [],
      isOwner: true
    }))
  } catch (error) {
    console.error('Failed to read local chats', error)
    return []
  }
}

export const chatsStore = createStore<LocalChatData[]>([])

function setStoredChats(next: LocalChatData[]) {
  const sorted = [...next].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  chatsStore.set(sorted)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(localChatsStorageKey, JSON.stringify(sorted))
  }
}

export function refreshChats() {
  chatsStore.set(readStoredChats().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
}

export function createChat(input: string, parts?: UIMessage['parts']) {
  const messageParts = parts?.length ? parts : [{ type: 'text' as const, text: input }]
  const now = new Date().toISOString()
  const chat: LocalChatData = {
    id: createId(),
    title: getTitle(input, messageParts),
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
    isOwner: true,
    votes: [],
    messages: [{
      id: createId(),
      role: 'user',
      parts: messageParts
    }]
  }

  setStoredChats([chat, ...chatsStore.get()])
  return chat
}

export function getChat(id: string) {
  if (!chatsStore.get().length) {
    refreshChats()
  }
  return chatsStore.get().find(chat => chat.id === id) || null
}

export function updateChatMessages(id: string, messages: UIMessage[]) {
  const now = new Date().toISOString()
  setStoredChats(chatsStore.get().map(chat => chat.id === id
    ? { ...chat, messages, updatedAt: now }
    : chat
  ))
}

export function updateChatVotes(id: string, votes: LocalVote[]) {
  setStoredChats(chatsStore.get().map(chat => chat.id === id ? { ...chat, votes } : chat))
}

export function deleteChat(id: string) {
  setStoredChats(chatsStore.get().filter(chat => chat.id !== id))
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 会话按时间分组（今天/昨天/最近一周/最近一月/更早按月） */
export function groupChats(chats: LocalChatData[]): ChatGroup[] {
  const now = new Date()
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(now.getDate() - 1)
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  const today: ChatListItem[] = []
  const yesterday: ChatListItem[] = []
  const lastWeek: ChatListItem[] = []
  const lastMonth: ChatListItem[] = []
  const older = new Map<string, ChatListItem[]>()

  for (const chat of chats) {
    const item: ChatListItem = {
      id: chat.id,
      label: chat.title || 'Untitled',
      href: `/chat/${chat.id}`,
      createdAt: chat.createdAt
    }
    const date = new Date(chat.createdAt)

    if (isSameDay(date, now)) today.push(item)
    else if (isSameDay(date, yesterdayDate)) yesterday.push(item)
    else if (date >= oneWeekAgo) lastWeek.push(item)
    else if (date >= oneMonthAgo) lastMonth.push(item)
    else {
      const key = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
      older.set(key, [...(older.get(key) || []), item])
    }
  }

  const groups: ChatGroup[] = []
  if (today.length) groups.push({ id: 'today', label: '今天', items: today })
  if (yesterday.length) groups.push({ id: 'yesterday', label: '昨天', items: yesterday })
  if (lastWeek.length) groups.push({ id: 'last-week', label: '最近一周', items: lastWeek })
  if (lastMonth.length) groups.push({ id: 'last-month', label: '最近一月', items: lastMonth })

  const olderKeys = [...older.keys()].sort((a, b) => (a < b ? 1 : -1))
  for (const key of olderKeys) {
    groups.push({ id: key, label: key, items: older.get(key)! })
  }
  return groups
}
