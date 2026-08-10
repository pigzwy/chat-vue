'use client'

import { useEffect } from 'react'
import { initModels } from '@/lib/models-store'
import { refreshChats } from '@/lib/chats-store'

/** 客户端全局初始化：读取 URL token、拉分组模型、同步本地会话 */
export function AppInit() {
  useEffect(() => {
    refreshChats()
    void initModels()
  }, [])
  return null
}
