'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
import {
  chatAttachmentLimit,
  chatAttachmentMaxFileSize,
  chatAttachmentMaxTotalSize,
  fileToMessageParts,
  formatFileSize,
  getAttachmentMediaType,
  getChatAttachmentUnsupportedReason,
  isImageMediaType
} from '@/lib/attachments'
import { toast } from '@/lib/toast'

export interface ChatAttachment {
  id: string
  file: File
  name: string
  size: number
  mediaType: string
  previewUrl?: string
}

export function useChatAttachments() {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  // 仅供卸载清理读取最新值；渲染期不写 ref（react-hooks/refs）
  const attachmentsRef = useRef(attachments)
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  const addFiles = useCallback((files: File[], model: string) => {
    setAttachments((current) => {
      let next = current
      for (const file of files) {
        if (next.length >= chatAttachmentLimit) {
          toast({ description: `单条消息最多添加 ${chatAttachmentLimit} 个附件`, color: 'warning' })
          break
        }
        const unsupportedReason = getChatAttachmentUnsupportedReason(file, model)
        if (unsupportedReason) {
          toast({ description: unsupportedReason, color: 'warning' })
          continue
        }
        if (file.size > chatAttachmentMaxFileSize) {
          toast({ description: `${file.name} 超过单个文件 ${formatFileSize(chatAttachmentMaxFileSize)} 限制`, color: 'warning' })
          continue
        }
        const totalSize = next.reduce((sum, item) => sum + item.size, 0)
        if (totalSize + file.size > chatAttachmentMaxTotalSize) {
          toast({ description: `附件总大小不能超过 ${formatFileSize(chatAttachmentMaxTotalSize)}`, color: 'warning' })
          continue
        }
        const mediaType = getAttachmentMediaType(file)
        next = [...next, {
          id: crypto.randomUUID(),
          file,
          name: file.name,
          size: file.size,
          mediaType,
          previewUrl: isImageMediaType(mediaType) ? URL.createObjectURL(file) : undefined
        }]
      }
      return next
    })
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find(item => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return current.filter(item => item.id !== id)
    })
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      })
      return []
    })
  }, [])

  const validateAttachments = useCallback((model: string) => {
    const invalid = attachments.find(item => getChatAttachmentUnsupportedReason(item.file, model))
    if (!invalid) return true
    toast({ description: getChatAttachmentUnsupportedReason(invalid.file, model), color: 'warning' })
    return false
  }, [attachments])

  const toMessageParts = useCallback(async (): Promise<UIMessage['parts']> => {
    const parts = await Promise.all(attachments.map(item => fileToMessageParts(item.file)))
    return parts.flat()
  }, [attachments])

  useEffect(() => () => {
    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
  }, [])

  return { attachments, addFiles, removeAttachment, clearAttachments, validateAttachments, toMessageParts }
}
