'use client'

import { useState } from 'react'
import { ChatConversation } from '@heroui-pro/react/chat-conversation'
import { ChatMessage as ProChatMessage } from '@heroui-pro/react/chat-message'
import { CircleAlert, Clapperboard, Copy, Download, Pencil, Quote, RotateCw, TimerOff, Trash2, WandSparkles } from 'lucide-react'
import { GeminiIcon, GrokIcon, OpenaiIcon } from '@/components/brand-icons'
import { StreamMinimap } from '@/components/studio/stream-minimap'
import { resolveMediaModelSpec } from '@/lib/shared/media-models'
import { useCachedVideoUrl } from '@/lib/studio/video-cache'
import {
  copyRevisedPrompt,
  deleteMediaTask,
  downloadMediaTask,
  formatTaskCreatedAt,
  getTaskDurationSeconds,
  previewMediaTask,
  retryMediaTask,
  reusePrompt,
  setCurrentTask,
  startVideoFromTask,
  studioStore,
  type MediaTask,
  type StudioState
} from '@/lib/studio/tasks-store'

/** 结果块下方的悬浮操作(Pro ChatMessage.Action:自带 tooltip/按压反馈) */
function TurnActions({ task, selected }: { task: MediaTask, selected: boolean }) {
  const isImage = task.kind === 'image' && Boolean(task.imageUrl)
  const done = Boolean(task.imageUrl || task.videoUrl)
  return (
    <ProChatMessage.Actions className="mt-1.5 flex gap-1 opacity-0 transition group-hover/turn:opacity-100 pointer-coarse:opacity-100">
      {done && (
        <ProChatMessage.Action aria-label="下载" tooltip="下载" className="glass-pill" onPress={() => { void downloadMediaTask(task) }}>
          <Download className="size-3.5" />
        </ProChatMessage.Action>
      )}
      {isImage && (
        <ProChatMessage.Action aria-label="用它生成视频" tooltip="用它生成视频" className="glass-pill" onPress={() => startVideoFromTask(task)}>
          <Clapperboard className="size-3.5" />
        </ProChatMessage.Action>
      )}
      {isImage && (
        <ProChatMessage.Action
          aria-label="继续编辑这张图"
          tooltip="继续编辑这张图"
          data-selected={selected}
          className="glass-pill"
          onPress={() => setCurrentTask(task)}
        >
          <Pencil className="size-3.5" />
        </ProChatMessage.Action>
      )}
      <ProChatMessage.Action aria-label="复用提示词" tooltip="复用提示词" className="glass-pill" onPress={() => reusePrompt(task)}>
        <Quote className="size-3.5" />
      </ProChatMessage.Action>
      <ProChatMessage.Action aria-label="删除" tooltip="删除" className="glass-pill" onPress={() => { void deleteMediaTask(task) }}>
        <Trash2 className="size-3.5" />
      </ProChatMessage.Action>
    </ProChatMessage.Actions>
  )
}

/** 模型品牌图标(静态条件渲染,规避 static-components 规则) */
function ModelBrandIcon({ model, className }: { model: string, className?: string }) {
  if (/grok/i.test(model)) return <GrokIcon className={className} />
  if (/gemini|banana/i.test(model)) return <GeminiIcon className={className} />
  if (/gpt|dall|openai/i.test(model)) return <OpenaiIcon className={className} />
  return <WandSparkles className={className} />
}

/** 单轮:右侧「你」的提示词气泡 + 左侧「模型」署名的回答 */
function StreamTurn({ task, state }: { task: MediaTask, state: StudioState }) {
  const spec = resolveMediaModelSpec(task.model)
  const selected = state.selectedTaskId === task.id
  const videoSrc = useCachedVideoUrl(task.id, task.videoUrl)
  // 视频代理地址随后端重启/任务过期(2h)失效,黑播放器换成明确的过期状态
  const [videoFailed, setVideoFailed] = useState(false)

  // 用户侧元信息:参数 + 时间
  const askMeta: string[] = []
  if (task.kind === 'image' && task.ratio && task.ratio !== 'Auto') askMeta.push(`${task.ratio} · ${task.resolution}`)
  if (task.kind === 'video' && task.duration) askMeta.push(`${task.duration}s${task.videoResolution ? ` · ${task.videoResolution}` : ''}`)
  askMeta.push(formatTaskCreatedAt(task))

  // 模型侧署名行的状态信息
  const answerMeta: string[] = []
  if (task.status === 'completed') {
    if (task.durationSeconds) answerMeta.push(`${task.durationSeconds}s`)
    if (task.costUsd) answerMeta.push(`$${task.costUsd.toFixed(3)}`)
  }

  return (
    <div className="group/turn flex flex-col gap-4" data-turn-id={task.id}>
      {/* 你:参考图缩略 + 提示词气泡,下方一行操作(复制/修改)+参数时间——对齐 OpenAI 的排法 */}
      <div className="flex flex-col items-end gap-1">
        {task.sourceThumbs && task.sourceThumbs.length > 0 && (
          <div className="flex justify-end gap-1.5 pb-0.5">
            {task.sourceThumbs.map((thumb, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={thumb}
                alt="参考图"
                className="size-16 rounded-xl border border-black/5 object-cover dark:border-white/10"
              />
            ))}
          </div>
        )}
        <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-black/[0.05] px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap dark:bg-white/[0.09]">
          {task.prompt}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex gap-0.5 opacity-0 transition group-hover/turn:opacity-100 pointer-coarse:opacity-100">
            <button
              type="button"
              aria-label="复制提示词"
              title="复制提示词"
              className="glass-pill p-1.5"
              onClick={() => { void copyRevisedPrompt(task.prompt) }}
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="修改提示词"
              title="修改提示词"
              className="glass-pill p-1.5"
              onClick={() => reusePrompt(task)}
            >
              <Pencil className="size-3.5" />
            </button>
          </span>
          <p className="label-mono text-[10px] opacity-50">{askMeta.join(' · ')}</p>
        </div>
      </div>

      {/* 模型:署名头(品牌图标+模型名+耗时/费用) + 缩进的回答内容 */}
      <div className="max-w-[85%] sm:max-w-[70%]">
        <div className="flex items-center gap-2">
          <div className="glass-orb flex size-7 shrink-0 items-center justify-center rounded-full">
            <ModelBrandIcon model={task.model} className="size-3.5" />
          </div>
          <span className="text-sm font-semibold">{spec.label}</span>
          {task.status === 'generating' && (
            <span className="label-mono text-[10px] opacity-60">
              {task.kind === 'video' ? '视频生成中' : '生成中'} · {getTaskDurationSeconds(state, task)}s
            </span>
          )}
          {answerMeta.length > 0 && (
            <span className="label-mono text-[10px] opacity-50">{answerMeta.join(' · ')}</span>
          )}
        </div>

        <div className="mt-2 pl-9">
          {task.status === 'generating' && (
            <div className="shimmer-block aspect-square w-56 rounded-2xl rounded-tl-md" />
          )}

          {task.status === 'error' && (
            <div className="flex max-w-md flex-col gap-2 rounded-2xl rounded-tl-md bg-red-500/10 px-4 py-3">
              <p className="flex items-start gap-2 text-sm leading-6 text-red-500">
                <CircleAlert className="mt-1 size-4 shrink-0" />
                <span className="min-w-0">{task.error || '生成失败'}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="glass-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                  onClick={() => { void retryMediaTask(task) }}
                >
                  <RotateCw className="size-3.5" />
                  重试
                </button>
                <button
                  type="button"
                  className="glass-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                  onClick={() => reusePrompt(task)}
                >
                  <Pencil className="size-3.5" />
                  修改提示词
                </button>
              </div>
            </div>
          )}

          {task.status === 'completed' && task.imageUrl && (
            <>
              <button
                type="button"
                className="block cursor-zoom-in overflow-hidden rounded-2xl rounded-tl-md border border-black/5 shadow-sm transition hover:brightness-105 dark:border-white/10"
                data-selected={selected}
                style={selected ? { outline: '2px solid var(--app-ink)', outlineOffset: 2 } : undefined}
                onClick={() => previewMediaTask(task)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={task.imageUrl} alt={task.prompt} className="block max-h-[420px] w-auto max-w-full" />
              </button>
              <TurnActions task={task} selected={selected} />
            </>
          )}

          {task.status === 'completed' && task.videoUrl && (
            <>
              {videoFailed
                ? (
                    <div className="flex flex-col items-start gap-2 rounded-2xl rounded-tl-md border border-black/5 bg-black/[0.03] px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.06]">
                      <p className="flex items-center gap-1.5 text-sm opacity-70">
                        <TimerOff className="size-4" />
                        视频已过期(链接随服务重启或 2 小时时效失效),请重新生成
                      </p>
                      <button
                        type="button"
                        className="glass-pill flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                        onClick={() => { void retryMediaTask(task) }}
                      >
                        <RotateCw className="size-3.5" />
                        重新生成
                      </button>
                    </div>
                  )
                : (
                    <video
                      src={videoSrc}
                      controls
                      playsInline
                      preload="metadata"
                      className="block max-h-[420px] w-auto max-w-full overflow-hidden rounded-2xl rounded-tl-md border border-black/5 shadow-sm dark:border-white/10"
                      onError={() => setVideoFailed(true)}
                    />
                  )}
              <TurnActions task={task} selected={selected} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 对话流视图:时间线自上而下,新结果在底部,自动黏底(Pro ChatConversation) */
export function MediaStream({ header }: { header?: React.ReactNode }) {
  const state = studioStore.useStore()
  const turns = [...state.queue].reverse()

  return (
    <>
      <StreamMinimap tasks={turns} />
      <ChatConversation className="min-h-0 flex-1" initial="instant" resize="smooth">
      <ChatConversation.Content className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pt-2 pb-72 sm:px-6">
        {header}
        {turns.map(task => (
          <StreamTurn key={task.id} task={task} state={state} />
        ))}
        <ChatConversation.ScrollAnchor />
        </ChatConversation.Content>
      </ChatConversation>
    </>
  )
}
