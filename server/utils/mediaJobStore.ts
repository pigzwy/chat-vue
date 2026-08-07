export type MediaJobStatus = 'queued' | 'running' | 'completed' | 'error'

export interface BaseJob {
  id: string
  status: MediaJobStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  errorStatus?: number
}

/**
 * 进程内媒体任务存储：Map + 按创建时间过期清理。
 * 注意：单副本内存实现，重启即失；多副本部署会破坏轮询（与图片任务同款取舍）。
 */
export function createJobStore<T extends BaseJob>(maxAgeMs: number) {
  const jobs = new Map<string, T>()

  function cleanup() {
    const now = Date.now()
    for (const [id, job] of jobs) {
      if (now - new Date(job.createdAt).getTime() > maxAgeMs) {
        jobs.delete(id)
      }
    }
  }

  function set(job: T) {
    cleanup()
    jobs.set(job.id, job)
  }

  function get(id: string) {
    cleanup()
    return jobs.get(id) || null
  }

  return { jobs, set, get, cleanup }
}

export function getElapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt)
}

export function toSafeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function parseJson<T>(text: string) {
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
