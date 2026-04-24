import { computed, onBeforeUnmount, ref } from 'vue'
import type { UIMessage } from 'ai'
import {
  chatAttachmentLimit,
  chatAttachmentMaxFileSize,
  chatAttachmentMaxTotalSize,
  fileToMessageParts,
  fileToUIPart,
  formatFileSize,
  getAttachmentMediaType,
  getChatAttachmentUnsupportedReason,
  isImageMediaType
} from '../utils/chatAttachments'

export interface ChatAttachment {
  id: string
  file: File
  name: string
  size: number
  mediaType: string
  previewUrl?: string
}

export function useChatAttachments() {
  const toast = useToast()
  const attachments = ref<ChatAttachment[]>([])
  const totalSize = computed(() => attachments.value.reduce((sum, item) => sum + item.size, 0))
  const hasAttachments = computed(() => attachments.value.length > 0)

  function notify(message: string) {
    toast.add({
      description: message,
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
  }

  function createAttachment(file: File): ChatAttachment {
    const mediaType = getAttachmentMediaType(file)
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      mediaType,
      previewUrl: isImageMediaType(mediaType) ? URL.createObjectURL(file) : undefined
    }
  }

  function revokeAttachment(attachment: ChatAttachment) {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
  }

  function validateAttachments(model: string) {
    const invalid = attachments.value.find(item => getChatAttachmentUnsupportedReason(item.file, model))
    if (!invalid) return true

    notify(getChatAttachmentUnsupportedReason(invalid.file, model))
    return false
  }

  function addFiles(files: File[], model: string) {
    for (const file of files) {
      if (attachments.value.length >= chatAttachmentLimit) {
        notify(`单条消息最多添加 ${chatAttachmentLimit} 个附件`)
        break
      }

      const unsupportedReason = getChatAttachmentUnsupportedReason(file, model)
      if (unsupportedReason) {
        notify(unsupportedReason)
        continue
      }

      if (file.size > chatAttachmentMaxFileSize) {
        notify(`${file.name} 超过单个文件 ${formatFileSize(chatAttachmentMaxFileSize)} 限制`)
        continue
      }
      if (totalSize.value + file.size > chatAttachmentMaxTotalSize) {
        notify(`附件总大小不能超过 ${formatFileSize(chatAttachmentMaxTotalSize)}`)
        continue
      }

      attachments.value = [...attachments.value, createAttachment(file)]
    }
  }

  function removeAttachment(id: string) {
    const target = attachments.value.find(item => item.id === id)
    if (!target) return

    revokeAttachment(target)
    attachments.value = attachments.value.filter(item => item.id !== id)
  }

  function clearAttachments() {
    attachments.value.forEach(revokeAttachment)
    attachments.value = []
  }

  async function toFileUIParts() {
    return await Promise.all(attachments.value.map(item => fileToUIPart(item.file)))
  }

  async function toMessageParts(): Promise<UIMessage['parts']> {
    const parts = await Promise.all(attachments.value.map(item => fileToMessageParts(item.file)))
    return parts.flat()
  }

  onBeforeUnmount(clearAttachments)

  return {
    attachments,
    hasAttachments,
    totalSize,
    addFiles,
    removeAttachment,
    clearAttachments,
    validateAttachments,
    toFileUIParts,
    toMessageParts
  }
}
