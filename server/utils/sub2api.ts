import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

export function sub2apiRootURL() {
  return (process.env.SUB2API_BASE_URL || process.env.VITE_SUB2API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export function sub2apiBaseURL() {
  const rootURL = sub2apiRootURL()
  return rootURL.endsWith('/v1') ? rootURL : `${rootURL}/v1`
}

export function createSub2apiChatModel(apiKey: string, model: string) {
  const baseURL = sub2apiBaseURL()

  // 判断是否为 Anthropic 模型
  const isAnthropic = model.startsWith('anthropic/') ||
                      model.startsWith('claude') ||
                      model.includes('claude')

  // 判断是否为 OpenAI 模型
  const isOpenAI = model.startsWith('openai/') ||
                   model.startsWith('gpt') ||
                   model.startsWith('o1') ||
                   model.startsWith('o3') ||
                   model.startsWith('o4') ||
                   model.includes('gpt')

  // Anthropic 模型使用 /v1/messages 接口
  if (isAnthropic) {
    return createAnthropic({
      apiKey,
      baseURL,
      name: 'anthropic'
    }).chat(model.replace('anthropic/', '') as any)
  }

  // OpenAI 模型使用 /v1/responses 接口（支持思考链）
  if (isOpenAI) {
    return createOpenAI({
      apiKey,
      baseURL,
      name: 'openai'
    }).responses(model.replace('openai/', '') as any)
  }

  // 其他模型使用 OpenAI 兼容接口
  return createOpenAI({
    apiKey,
    baseURL,
    name: 'openai'
  }).chat(model as any)
}
