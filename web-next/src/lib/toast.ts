import { createStore } from './store'

export interface ToastItem {
  id: string
  title?: string
  description: string
  color?: 'default' | 'warning' | 'error' | 'success'
  duration?: number
}

export const toastStore = createStore<ToastItem[]>([])

export function toast(input: Omit<ToastItem, 'id'>) {
  const item: ToastItem = { id: crypto.randomUUID(), duration: 4200, ...input }
  toastStore.set(list => [...list, item])
  if (item.duration && item.duration > 0) {
    setTimeout(() => dismissToast(item.id), item.duration)
  }
  return item.id
}

export function dismissToast(id: string) {
  toastStore.set(list => list.filter(item => item.id !== id))
}
