import { isToday, isYesterday, subMonths } from 'date-fns'
import { computed, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { UIMessage } from 'ai'

const localChatsStorageKey = 'pigcoder-local-chats'

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

interface Chat {
  id: string
  label: string
  to: string
  icon: string
  createdAt: string
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
    const raw = window.localStorage.getItem(localChatsStorageKey)
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

function writeStoredChats(chats: LocalChatData[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(localChatsStorageKey, JSON.stringify(chats))
}

export const useChats = createSharedComposable(() => {
  const storedChats = ref<LocalChatData[]>([])

  function setStoredChats(next: LocalChatData[]) {
    storedChats.value = [...next].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    writeStoredChats(storedChats.value)
  }

  const fetchChats = async () => {
    // 聊天记录已从 SQL 改为浏览器 localStorage，本方法只同步本地缓存。
    setStoredChats(readStoredChats())
  }

  function createChat(input: string, parts?: UIMessage['parts']) {
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

    setStoredChats([chat, ...storedChats.value])
    return chat
  }

  function getChat(id: string) {
    if (!storedChats.value.length) {
      storedChats.value = readStoredChats()
    }
    return storedChats.value.find(chat => chat.id === id) || null
  }

  function updateChatMessages(id: string, messages: UIMessage[]) {
    const now = new Date().toISOString()
    setStoredChats(storedChats.value.map(chat => chat.id === id
      ? { ...chat, messages, updatedAt: now }
      : chat
    ))
  }

  function updateChatVotes(id: string, votes: LocalVote[]) {
    setStoredChats(storedChats.value.map(chat => chat.id === id ? { ...chat, votes } : chat))
  }

  function deleteChat(id: string) {
    setStoredChats(storedChats.value.filter(chat => chat.id !== id))
  }

  const chats = computed<Chat[]>(() => storedChats.value.map(chat => ({
    id: chat.id,
    label: chat.title || 'Untitled',
    to: `/chat/${chat.id}`,
    icon: 'i-lucide-message-circle',
    createdAt: chat.createdAt
  })))

  const groups = computed(() => {
    // Group chats by date
    const today: Chat[] = []
    const yesterday: Chat[] = []
    const lastWeek: Chat[] = []
    const lastMonth: Chat[] = []
    const older: Record<string, Chat[]> = {}

    const oneWeekAgo = subMonths(new Date(), 0.25) // ~7 days ago
    const oneMonthAgo = subMonths(new Date(), 1)

    chats.value?.forEach((chat) => {
      const chatDate = new Date(chat.createdAt)

      if (isToday(chatDate)) {
        today.push(chat)
      } else if (isYesterday(chatDate)) {
        yesterday.push(chat)
      } else if (chatDate >= oneWeekAgo) {
        lastWeek.push(chat)
      } else if (chatDate >= oneMonthAgo) {
        lastMonth.push(chat)
      } else {
        const monthYear = chatDate.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric'
        })

        if (!older[monthYear]) {
          older[monthYear] = []
        }

        older[monthYear].push(chat)
      }
    })

    const sortedMonthYears = Object.keys(older).sort((a, b) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateB.getTime() - dateA.getTime()
    })

    const formattedGroups = [] as Array<{
      id: string
      label: string
      items: Array<Chat>
    }>

    if (today.length) {
      formattedGroups.push({
        id: 'today',
        label: 'Today',
        items: today
      })
    }

    if (yesterday.length) {
      formattedGroups.push({
        id: 'yesterday',
        label: 'Yesterday',
        items: yesterday
      })
    }

    if (lastWeek.length) {
      formattedGroups.push({
        id: 'last-week',
        label: 'Last week',
        items: lastWeek
      })
    }

    if (lastMonth.length) {
      formattedGroups.push({
        id: 'last-month',
        label: 'Last month',
        items: lastMonth
      })
    }

    sortedMonthYears.forEach((monthYear) => {
      if (older[monthYear]?.length) {
        formattedGroups.push({
          id: monthYear,
          label: monthYear,
          items: older[monthYear]
        })
      }
    })

    return formattedGroups
  })

  void fetchChats()

  return {
    groups,
    chats,
    fetchChats,
    createChat,
    getChat,
    updateChatMessages,
    updateChatVotes,
    deleteChat
  }
})
