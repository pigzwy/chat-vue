'use client'

import { CheckCheck, Download, SquareCheck, Trash, X } from 'lucide-react'
import {
  deleteSelectedTasks,
  downloadSelectedTasks,
  selectAllBatchTasks,
  selectDownloadableTasks,
  selectSelectedBatchTasks,
  studioStore,
  toggleBatchMode
} from '@/lib/studio/tasks-store'

const pillClass = 'glass-pill flex items-center gap-1 px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40'

/** 批量管理工具栏：全选 / 下载 / 删除所选 / 退出 */
export function TaskBatchToolbar() {
  const state = studioStore.useStore()
  const selectedBatchTasks = selectSelectedBatchTasks(state)
  const downloadableTasks = selectDownloadableTasks(state)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state.batchMode
        ? (
            <>
              <span className="label-mono mr-1">
                已选 {selectedBatchTasks.length} / {downloadableTasks.length}
              </span>
              <button type="button" className={pillClass} onClick={() => selectAllBatchTasks()}>
                <CheckCheck className="size-3.5" />
                全选
              </button>
              <button
                type="button"
                disabled={!selectedBatchTasks.length}
                className={pillClass}
                onClick={() => downloadSelectedTasks()}
              >
                <Download className="size-3.5" />
                下载
              </button>
              <button
                type="button"
                disabled={!selectedBatchTasks.length}
                className={`${pillClass} text-red-500 hover:text-red-600`}
                onClick={() => { void deleteSelectedTasks() }}
              >
                <Trash className="size-3.5" />
                删除
              </button>
              <button type="button" className={pillClass} onClick={() => toggleBatchMode()}>
                <X className="size-3.5" />
                取消
              </button>
            </>
          )
        : (
            <button
              type="button"
              disabled={!downloadableTasks.length}
              className={pillClass}
              onClick={() => toggleBatchMode()}
            >
              <SquareCheck className="size-3.5" />
              批量管理
            </button>
          )}
    </div>
  )
}
