const imageRequestTimeoutMs = 1000 * 60 * 10

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function withImageRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMessage = '图片请求超时，请稍后重试'
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), imageRequestTimeoutMs)

  try {
    return await request(controller.signal)
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
