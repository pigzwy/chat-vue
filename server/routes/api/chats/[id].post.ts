import type { TextStreamPart, ToolSet, UIMessage } from 'ai'
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
import { createSub2apiChatModel, isAnthropicModel, isOpenAIResponsesModel } from '../../../utils/sub2api'

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

type ProviderOptionsResult = { providerOptions: Record<string, any> } | undefined
type StreamPart = TextStreamPart<ToolSet>
type RawOpenAIChatChunk = {
  choices?: Array<{
    delta?: {
      reasoning_content?: string | null
      reasoning?: string | null
    }
  }>
}
type ThinkStreamState = {
  isReasoning: boolean
  textId: string
  reasoningId: number
  buffer: string
}

function buildProviderOptions(
  model: string,
  usesSub2api: boolean,
  reasoningEffort: ReasoningEffort
): ProviderOptionsResult {
  if (reasoningEffort === 'auto') return undefined

  if (isAnthropicModel(model)) {
    return {
      providerOptions: {
        anthropic: {
          effort: reasoningEffort
        } satisfies AnthropicLanguageModelOptions
      }
    }
  }

  if (isOpenAIResponsesModel(model) || usesSub2api) {
    return {
      providerOptions: {
        openai: {
          reasoningEffort,
          reasoningSummary: 'detailed'
        } satisfies OpenAILanguageModelResponsesOptions
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

function createNewApiReasoningTransform() {
  return () => {
    const state: ThinkStreamState = {
      isReasoning: false,
      textId: '',
      reasoningId: 0,
      buffer: ''
    }

    return new TransformStream<StreamPart, StreamPart>({
      transform(chunk, controller) {
        if (chunk.type === 'raw') {
          enqueueRawReasoning(chunk.rawValue, controller, state.reasoningId++)
          return
        }

        if (chunk.type === 'text-start') state.textId = chunk.id
        if (chunk.type !== 'text-delta') {
          flushBuffer(controller, state)
          controller.enqueue(chunk)
          return
        }

        state.textId = chunk.id
        state.buffer += chunk.text
        flushThinkBuffer(controller, state)
      },
      flush(controller) {
        flushBuffer(controller, state)
      }
    })
  }
}

function flushThinkBuffer(
  controller: TransformStreamDefaultController<StreamPart>,
  state: ThinkStreamState
) {
  while (state.buffer) {
    const tag = state.isReasoning ? THINK_CLOSE_TAG : THINK_OPEN_TAG
    const tagIndex = state.buffer.indexOf(tag)
    const possibleTagIndex = getPartialTagIndex(state.buffer, tag)

    if (tagIndex === -1) {
      const publishEnd = possibleTagIndex ?? state.buffer.length
      publishTextChunk(controller, state.buffer.slice(0, publishEnd), state)
      state.buffer = state.buffer.slice(publishEnd)
      break
    }

    publishTextChunk(controller, state.buffer.slice(0, tagIndex), state)
    state.buffer = state.buffer.slice(tagIndex + tag.length)

    if (state.isReasoning) {
      controller.enqueue({ type: 'reasoning-end', id: getReasoningId(state.reasoningId) })
      state.reasoningId++
    } else {
      controller.enqueue({ type: 'reasoning-start', id: getReasoningId(state.reasoningId) })
    }
    state.isReasoning = !state.isReasoning
  }
}

function flushBuffer(
  controller: TransformStreamDefaultController<StreamPart>,
  state: ThinkStreamState
) {
  if (!state.buffer) return
  publishTextChunk(controller, state.buffer, state)
  state.buffer = ''

  if (state.isReasoning) {
    controller.enqueue({ type: 'reasoning-end', id: getReasoningId(state.reasoningId) })
    state.reasoningId++
    state.isReasoning = false
  }
}

function publishTextChunk(
  controller: TransformStreamDefaultController<StreamPart>,
  text: string,
  state: ThinkStreamState
) {
  if (!text) return

  if (state.isReasoning) {
    controller.enqueue({ type: 'reasoning-delta', id: getReasoningId(state.reasoningId), text })
    return
  }

  controller.enqueue({ type: 'text-delta', id: state.textId, text })
}

function enqueueRawReasoning(
  rawValue: unknown,
  controller: TransformStreamDefaultController<StreamPart>,
  reasoningId: number
) {
  const reasoningText = getRawReasoningText(rawValue)
  if (!reasoningText) return

  const id = `raw-reasoning-${reasoningId}`
  controller.enqueue({ type: 'reasoning-start', id })
  controller.enqueue({ type: 'reasoning-delta', id, text: reasoningText })
  controller.enqueue({ type: 'reasoning-end', id })
}

function getRawReasoningText(rawValue: unknown) {
  const value = rawValue as RawOpenAIChatChunk
  const delta = value.choices?.[0]?.delta
  return delta?.reasoning_content || delta?.reasoning || ''
}

function getReasoningId(index: number) {
  return `think-reasoning-${index}`
}

function getPartialTagIndex(text: string, tag: string) {
  for (let length = tag.length - 1; length > 0; length--) {
    if (text.endsWith(tag.slice(0, length))) return text.length - length
  }
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
        includeRawChunks: usesSub2api,
        experimental_transform: [createNewApiReasoningTransform(), smoothStream()]
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
