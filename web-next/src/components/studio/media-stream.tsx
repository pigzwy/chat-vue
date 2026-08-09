'use client'

import { ChatConversation } from '@heroui-pro/react/chat-conversation'
import { ChatMessage as ProChatMessage } from '@heroui-pro/react/chat-message'
import { CircleAlert, Clapperboard, Download, Pencil, Quote, RotateCw, Trash2 } from 'lucide-react'
import { resolveMediaModelSpec } from '@/lib/shared/media-models'
import {
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
    <ProChatMessage.Actions className="mt-1.5 flex gap-1 opacity-0 transition group-hover/turn:opacity-100">
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

/** 单轮:右侧提示词气泡 + 左侧生成结果 */
function StreamTurn({ task, state }: { task: MediaTask, state: StudioState }) {
  const spec = resolveMediaModelSpec(task.model)
  const selected = state.selectedTaskId === task.id
  const metaParts = [spec.label]
  if (task.kind === 'image' && task.ratio && task.ratio !== 'Auto') metaParts.push(`${task.ratio} · ${task.resolution}`)
  if (task.kind === 'video' && task.duration) metaParts.push(`${task.duration}s${task.videoResolution ? ` · ${task.videoResolution}` : ''}`)
  metaParts.push(formatTaskCreatedAt(task))

  const doneMeta: string[] = []
  if (task.durationSeconds) doneMeta.push(`${task.durationSeconds}s`)
  if (task.costUsd) doneMeta.push(`$${task.costUsd.toFixed(3)}`)

  return (
    <div className="group/turn flex flex-col gap-3">
      {/* 用户侧:提示词 */}
      <div className="flex flex-col items-end gap-1">
        <div className="glass-panel max-w-[80%] rounded-3xl rounded-br-lg px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          {task.prompt}
        </div>
        <p className="label-mono text-[10px] opacity-50">{metaParts.join(' · ')}</p>
      </div>

      {/* 结果侧 */}
      <div className="max-w-[85%] sm:max-w-[70%]">
        {task.status === 'generating' && (
          <div className="glass-panel flex w-64 flex-col gap-3 rounded-3xl rounded-tl-lg p-4">
            <div className="shimmer-block aspect-square w-full rounded-2xl" />
            <p className="label-mono">
              {task.kind === 'video' ? '视频生成中' : '生成中'} · {getTaskDurationSeconds(state, task)}s
            </p>
          </div>
        )}

        {task.status === 'error' && (
          <div className="flex max-w-md flex-col gap-2 rounded-3xl rounded-tl-lg bg-red-500/10 px-4 py-3">
            <p className="flex items-start gap-2 text-sm leading-6 text-red-500">
              <CircleAlert className="mt-1 size-4 shrink-0" />
              <span className="min-w-0">{task.error || '生成失败'}</span>
            </p>
            <button
              type="button"
              className="glass-pill flex w-fit items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
              onClick={() => { void retryMediaTask(task) }}
            >
              <RotateCw className="size-3.5" />
              重试
            </button>
          </div>
        )}

        {task.status === 'completed' && task.imageUrl && (
          <>
            <button
              type="button"
              className="block cursor-zoom-in overflow-hidden rounded-3xl rounded-tl-lg border border-black/5 transition hover:brightness-105 dark:border-white/10"
              data-selected={selected}
              style={selected ? { outline: '2px solid var(--app-primary)', outlineOffset: 2 } : undefined}
              onClick={() => previewMediaTask(task)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={task.imageUrl} alt={task.prompt} className="block max-h-[420px] w-auto max-w-full" />
            </button>
            {doneMeta.length > 0 && <p className="label-mono mt-1.5 text-[10px] opacity-50">{doneMeta.join(' · ')}</p>}
            <TurnActions task={task} selected={selected} />
          </>
        )}

        {task.status === 'completed' && task.videoUrl && (
          <>
            <video
              src={task.videoUrl}
              controls
              playsInline
              preload="metadata"
              className="block max-h-[420px] w-auto max-w-full overflow-hidden rounded-3xl rounded-tl-lg border border-black/5 dark:border-white/10"
            />
            {doneMeta.length > 0 && <p className="label-mono mt-1.5 text-[10px] opacity-50">{doneMeta.join(' · ')}</p>}
            <TurnActions task={task} selected={selected} />
          </>
        )}
      </div>
    </div>
  )
}

/** 对话流视图:时间线自上而下,新结果在底部,自动黏底(Pro ChatConversation) */
export function MediaStream({ header }: { header?: React.ReactNode }) {
  const state = studioStore.useStore()
  const turns = [...state.queue].reverse()

  return (
    <ChatConversation className="min-h-0 flex-1" initial="instant" resize="smooth">
      <ChatConversation.Content className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pt-2 pb-72 sm:px-6">
        {header}
        {turns.map(task => (
          <StreamTurn key={task.id} task={task} state={state} />
        ))}
        <ChatConversation.ScrollAnchor />
      </ChatConversation.Content>
      <ChatConversation.ScrollButton aria-label="回到底部" className="bottom-72" />
    </ChatConversation>
  )
}
