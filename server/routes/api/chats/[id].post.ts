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
import { CHAT_SYSTEM_PROMPT } from '../../../utils/prompts'

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'
// 工具调用最多串联的步数（一次对话内）。控制成本与延迟，必要时按模型/工具数调整。
const MAX_TOOL_STEPS = 5

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

// anthropic/google 的思考档位只有三档，扩展档（minimal/xhigh/max）就近收窄；
// openai/sub2api 路径原样透传，由上游模型自行裁决（如 GPT-5.6 的 Max）
function clampReasoningEffort(effort: Exclude<ReasoningEffort, 'auto'>): 'low' | 'medium' | 'high' {
  if (effort === 'minimal') return 'low'
  if (effort === 'xhigh' || effort === 'max') return 'high'
  return effort
}

// grok 上游不接受 reasoning_effort 参数(带上直接 400 断请求);
// 思考与否由模型变体决定(-reasoning / -non-reasoning),强度参数必须剥掉
function isGrokModel(model: string) {
  return /^grok|^x-ai\//i.test(model) || model.includes('grok')
}

function buildProviderOptions(
  model: string,
  usesSub2api: boolean,
  reasoningEffort: ReasoningEffort
): ProviderOptionsResult {
  if (reasoningEffort === 'auto') return undefined
  if (isGrokModel(model)) return undefined

  if (isAnthropicModel(model)) {
    return {
      providerOptions: {
        anthropic: {
          effort: clampReasoningEffort(reasoningEffort)
        } satisfies AnthropicLanguageModelOptions
      }
    }
  }

  if (isOpenAIResponsesModel(model) || usesSub2api) {
    return {
      providerOptions: {
        openai: {
          // ai-sdk 的枚举无 'max'(校验会抛错断请求),就近收敛到 xhigh
          reasoningEffort: (reasoningEffort === 'max' ? 'xhigh' : reasoningEffort) as OpenAILanguageModelResponsesOptions['reasoningEffort'],
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
            thinkingLevel: clampReasoningEffort(reasoningEffort)
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
    apiKey: z.string().trim().min(20).optional(),
    model: z.string().min(1),
    messages: z.array(z.object({
      id: z.string().optional(),
      role: z.enum(['system', 'user', 'assistant']),
      parts: z.array(z.object({ type: z.string() }).passthrough()).min(1)
    }).passthrough()).min(1) as unknown as z.ZodType<UIMessage[]>,
    reasoningEffort: z.enum(reasoningEffortValues).optional().default('auto')
  }).parse)

  const usesSub2api = Boolean(apiKey)
  if (!usesSub2api) {
    // 不带 key 的请求会落到 AI Gateway,花的是**本服务**的 AI_GATEWAY_API_KEY,
    // 而本路由无鉴权无限流——默认关掉,避免误配成一个公网开放的免费 AI 代理。
    // 确需开放兜底(如内网自用)时显式设 ALLOW_ANONYMOUS_GATEWAY_CHAT=true。
    if (process.env.ALLOW_ANONYMOUS_GATEWAY_CHAT !== 'true') {
      throw new HTTPError({ statusCode: 401, statusMessage: '请先登录后再发起对话' })
    }
    if (!MODELS.some(m => m.value === model)) {
      throw new HTTPError({ statusCode: 400, statusMessage: 'Invalid model' })
    }
  }

  // SQL 聊天存储已停用：会话、标题、消息和投票都由前端 localStorage 管理。
  // 这里不再查询 chats 表，也不再把用户消息或助手回复写入 messages 表。

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        abortSignal: event.req.signal,
        model: apiKey ? createSub2apiChatModel(apiKey, model) : gateway(model),
        system: CHAT_SYSTEM_PROMPT,
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
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
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
