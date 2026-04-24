import { createOpenAI } from '@ai-sdk/openai'

export function sub2apiRootURL() {
  return (process.env.SUB2API_BASE_URL || process.env.VITE_SUB2API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export function sub2apiBaseURL() {
  const rootURL = sub2apiRootURL()
  return rootURL.endsWith('/v1') ? rootURL : `${rootURL}/v1`
}

export function createSub2apiChatModel(apiKey: string, model: string) {
  return createOpenAI({
    apiKey,
    baseURL: sub2apiBaseURL(),
    name: 'openai'
  }).chat(model as any)
}
