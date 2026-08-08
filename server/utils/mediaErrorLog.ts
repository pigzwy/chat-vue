import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface MediaErrorEntry {
  time: string
  kind: 'image' | 'video'
  jobId: string
  model: string
  status?: number
  error: string
  requestId?: string
  /** 便于排查内容审核类失败 */
  promptExcerpt?: string
  extra?: Record<string, unknown>
}

const maxMemoryEntries = 200
const maxLogFileBytes = 5 * 1024 * 1024
const logDir = join(process.cwd(), '.data')
const logFile = join(logDir, 'media-errors.jsonl')

const recentErrors: MediaErrorEntry[] = []
let dirReady = false

async function appendToFile(line: string) {
  try {
    if (!dirReady) {
      await mkdir(logDir, { recursive: true })
      dirReady = true
    }
    const size = await stat(logFile).then(info => info.size).catch(() => 0)
    if (size > maxLogFileBytes) {
      // 简单轮转：保留一代旧文件
      await rename(logFile, `${logFile}.1`).catch(() => {})
    }
    await appendFile(logFile, `${line}\n`)
  } catch {
    // 日志写盘失败不影响业务
  }
}

/** 记录媒体任务失败：内存环形缓冲（最近 200 条）+ .data/media-errors.jsonl 落盘 */
export function recordMediaError(entry: Omit<MediaErrorEntry, 'time'>) {
  const full: MediaErrorEntry = { time: new Date().toISOString(), ...entry }
  recentErrors.push(full)
  if (recentErrors.length > maxMemoryEntries) {
    recentErrors.splice(0, recentErrors.length - maxMemoryEntries)
  }
  void appendToFile(JSON.stringify(full))
}

export function getRecentMediaErrors(limit = 50) {
  return recentErrors.slice(-Math.max(1, Math.min(limit, maxMemoryEntries))).reverse()
}
