export interface RequestError extends Error {
  status?: number
  streamStarted?: boolean
  retryableStream?: boolean
}
