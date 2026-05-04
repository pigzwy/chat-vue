import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

export function sub2apiRootURL() {
  return (process.env.SUB2API_BASE_URL || process.env.VITE_SUB2API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export function sub2apiBaseURL() {
  const rootURL = sub2apiRootURL()
  return rootURL.endsWith('/v1') ? rootURL : `${rootURL}/v1`
}

export function isAnthropicModel(model: string) {
  return model.startsWith('anthropic/') || model.startsWith('claude') || model.includes('claude')
}

export function isOpenAIResponsesModel(model: string) {
  return model.startsWith('openai/')
    || model.startsWith('gpt')
    || model.startsWith('o1')
    || model.startsWith('o3')
    || model.startsWith('o4')
    || model.includes('gpt')
}

export function createSub2apiChatModel(apiKey: string, model: string) {
  const baseURL = sub2apiBaseURL()

  if (isAnthropicModel(model)) {
    return createAnthropic({
      apiKey,
      baseURL,
      name: 'anthropic'
    }).chat(model.replace('anthropic/', '') as any)
  }

  const openaiProvider = createOpenAI({
    apiKey,
    baseURL,
    name: 'openai'
  })

  if (isOpenAIResponsesModel(model)) {
    return openaiProvider.responses(model.replace('openai/', '') as any)
  }

  return openaiProvider.chat(model as any)
}
