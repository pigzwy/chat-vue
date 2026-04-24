import type { UIMessage } from 'ai'
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, smoothStream, stepCountIs, streamText } from 'ai'
import { gateway } from '@ai-sdk/gateway'
import { z } from 'zod'
import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import { anthropic } from '@ai-sdk/anthropic'
import type { GoogleLanguageModelOptions } from '@ai-sdk/google'
// import { google } from '@ai-sdk/google'
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai'
import { openai } from '@ai-sdk/openai'
import { defineHandler, HTTPError } from 'nitro'
import { getValidatedRouterParams, readValidatedBody } from 'nitro/h3'
import { weatherTool } from '../../../utils/tools/weather'
import { chartTool } from '../../../utils/tools/chart'
import { MODELS } from '../../../../shared/utils/models'
import { reasoningEffortValues } from '../../../../shared/utils/reasoning'
import type { ReasoningEffort } from '../../../../shared/utils/reasoning'
import { createSub2apiChatModel } from '../../../utils/sub2api'

function buildProviderOptions(model: string, usesSub2api: boolean, reasoningEffort: ReasoningEffort) {
  if (reasoningEffort === 'auto') return undefined

  if (usesSub2api || model.startsWith('openai/')) {
    return {
      providerOptions: {
        openai: {
          reasoningEffort,
          reasoningSummary: 'detailed'
        } satisfies OpenAILanguageModelResponsesOptions
      }
    }
  }

  if (model.startsWith('anthropic/')) {
    return {
      providerOptions: {
        anthropic: {
          effort: reasoningEffort
        } satisfies AnthropicLanguageModelOptions
      }
    }
  }

  if (model.startsWith('google/')) {
    return {
      providerOptions: {
        google: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: reasoningEffort
          }
        } satisfies GoogleLanguageModelOptions
      }
    }
  }

  return undefined
}

export default defineHandler(async (event) => {
  await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { apiKey, model, messages, reasoningEffort } = await readValidatedBody(event, z.object({
    apiKey: z.string().optional(),
    model: z.string().min(1),
    messages: z.array(z.custom<UIMessage>()),
    reasoningEffort: z.enum(reasoningEffortValues).optional().default('auto')
  }).parse)

  const usesSub2api = Boolean(apiKey)
  if (!usesSub2api && !MODELS.some(m => m.value === model)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Invalid model' })
  }

  // SQL 聊天存储已停用：会话、标题、消息和投票都由前端 localStorage 管理。
  // 这里不再查询 chats 表，也不再把用户消息或助手回复写入 messages 表。

  const abortController = new AbortController()
  event.runtime?.node?.req?.on('close', () => abortController.abort())

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        abortSignal: abortController.signal,
        model: apiKey ? createSub2apiChatModel(apiKey, model) : gateway(model),
        system: `You are a knowledgeable and helpful AI assistant. Your goal is to provide clear, accurate, and well-structured responses.

**FORMATTING RULES (CRITICAL):**
- ABSOLUTELY NO MARKDOWN HEADINGS: Never use #, ##, ###, ####, #####, or ######
- NO underline-style headings with === or ---
- Use **bold text** for emphasis and section labels instead
- Examples:
  * Instead of "## Usage", write "**Usage:**" or just "Here's how to use it:"
  * Instead of "# Complete Guide", write "**Complete Guide**" or start directly with content
- Start all responses with content, never with a heading

**WEB SEARCH:**
- You have access to a web search tool to find current, up-to-date information
- Only use it when the user explicitly asks about recent events, real-time data, or current facts
- Do NOT search proactively — rely on your knowledge first
- Cite your sources when providing information from web search results

**RESPONSE QUALITY:**
- Be concise yet comprehensive
- Use examples when helpful
- Break down complex topics into digestible parts
- Maintain a friendly, professional tone`,
        messages: await convertToModelMessages(messages),
        tools: {
          chart: chartTool,
          weather: weatherTool,
          ...(!usesSub2api && model.startsWith('anthropic/') && { web_search: anthropic.tools.webSearch_20250305() }),
          ...(!usesSub2api && model.startsWith('openai/') && { web_search: openai.tools.webSearch() })
          // TODO: enable once AI SDK supports combining provider-defined tools with custom tools
          // ...(model.startsWith('google/') && { google_search: google.tools.googleSearch({}) })
        },
        ...buildProviderOptions(model, usesSub2api, reasoningEffort),
        stopWhen: stepCountIs(5),
        experimental_transform: smoothStream()
      })

      writer.merge(result.toUIMessageStream({
        sendSources: true,
        sendReasoning: true
      }))
    }
  })

  return createUIMessageStreamResponse({
    stream
  })
})
