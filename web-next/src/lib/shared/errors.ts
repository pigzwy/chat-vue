// 由 scripts/sync-shared.mjs 从 shared/utils/errors.ts 自动同步,请勿直接编辑此文件。
// 改动请改源文件后运行:node scripts/sync-shared.mjs
export interface RequestError extends Error {
  status?: number
  streamStarted?: boolean
  retryableStream?: boolean
}
