'use client'

import { useState } from 'react'
import { Dropdown, Separator, Tooltip } from '@heroui/react'
import {
  Check,
  CircleAlert,
  Clapperboard,
  Copy,
  Download,
  Ellipsis,
  Eye,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  RotateCw,
  TextCursorInput,
  TimerOff,
  Trash
} from 'lucide-react'
import { useCachedVideoUrl } from '@/lib/studio/video-cache'
import {
  addTaskImageAsReference,
  copyImage,
  deleteMediaTask,
  downloadMediaTask,
  formatTaskCreatedAt,
  getTaskDurationSeconds,
  previewMediaTask,
  retryMediaTask,
  reusePrompt,
  selectMediaTask,
  setCurrentTask,
  startVideoFromTask,
  studioStore,
  toggleBatchTask,
  type MediaTask
} from '@/lib/studio/tasks-store'

interface MenuItem {
  label: string
  Icon: typeof Eye
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

const overlayBtnClass = 'flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/70'
const tooltipClass = 'glass-panel rounded-full px-2.5 py-1 text-xs font-medium'

/** 单条生成任务卡片：生成中 / 失败 / 完成三态 + 操作菜单 + 批量选择 */
export function MediaTaskCard({ task }: { task: MediaTask }) {
  const cachedVideoSrc = useCachedVideoUrl(task.id, task.videoUrl)
  const state = studioStore.useStore()
  // 视频代理地址随任务过期（2h/服务重启）失效，加载失败时给出明确状态
  const [videoFailed, setVideoFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const hasMedia = Boolean(task.imageUrl || task.videoUrl)
  const isVideo = task.kind === 'video'
  const isSelectedForEdit = state.selectedTaskId === task.id
  const isBatchSelected = state.selectedBatchIds.includes(task.id)

  const metaParts: string[] = [task.model]
  if (isVideo) {
    if (task.duration) metaParts.push(`${task.duration}s`)
    if (task.videoResolution) metaParts.push(task.videoResolution)
  } else {
    if (task.resolution) metaParts.push(task.resolution)
    if (task.ratio) metaParts.push(task.ratio)
  }
  const metaText = metaParts.join(' · ')

  const mainItems: MenuItem[] = [
    { label: '预览', Icon: Eye, onSelect: () => previewMediaTask(task) },
    ...(!isVideo
      ? [
          { label: '用它生成视频', Icon: Clapperboard, onSelect: () => startVideoFromTask(task) },
          { label: '设为当前编辑', Icon: Pencil, disabled: isSelectedForEdit, onSelect: () => setCurrentTask(task) },
          { label: '加入参考图', Icon: Paperclip, onSelect: () => { void addTaskImageAsReference(task) } }
        ]
      : []),
    { label: '复用提示词', Icon: TextCursorInput, onSelect: () => reusePrompt(task) }
  ]
  const shareItems: MenuItem[] = [
    ...(!isVideo ? [{ label: '复制图片', Icon: Copy, onSelect: () => { void copyImage(task) } }] : []),
    { label: '下载', Icon: Download, onSelect: () => { void downloadMediaTask(task) } }
  ]
  const dangerItems: MenuItem[] = [
    { label: '删除', Icon: Trash, danger: true, onSelect: () => { void deleteMediaTask(task) } }
  ]
  const menuGroups = [mainItems, shareItems, dangerItems]

  function onMediaClick() {
    if (!hasMedia) return
    if (state.batchMode) {
      toggleBatchTask(task)
      return
    }
    if (isVideo) {
      previewMediaTask(task)
      return
    }
    selectMediaTask(task)
  }

  function onVideoEnter(event: React.MouseEvent<HTMLVideoElement>) {
    void event.currentTarget.play().catch(() => {})
  }

  function onVideoLeave(event: React.MouseEvent<HTMLVideoElement>) {
    const video = event.currentTarget
    video.pause()
    video.currentTime = 0
  }

  return (
    <article
      className={`glass-card-hover group relative flex flex-col overflow-hidden rounded-2xl animate-fade-scale ${isSelectedForEdit ? 'ring-2 ring-(--app-primary)' : ''}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-black/5 dark:bg-white/5">
        {task.status === 'generating' && (
          <>
            <div className="shimmer-block absolute inset-0" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              {isVideo ? <Clapperboard className="size-6 opacity-50" /> : <ImageIcon className="size-6 opacity-50" />}
              <p className="label-mono">
                {isVideo ? '视频生成中' : '图片生成中'} · {getTaskDurationSeconds(state, task)}s
              </p>
              <p className="line-clamp-2 text-xs opacity-60">{task.prompt}</p>
            </div>
          </>
        )}

        {task.status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <CircleAlert className="size-6 text-red-500" />
            <p className="line-clamp-3 text-xs opacity-60">{task.error || '生成失败'}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="glass-pill flex items-center gap-1 px-2.5 py-1 text-xs font-semibold"
                onClick={() => { void retryMediaTask(task) }}
              >
                <RotateCw className="size-3.5" />
                重试
              </button>
              <button
                type="button"
                aria-label="删除"
                className="glass-pill p-1.5"
                onClick={() => { void deleteMediaTask(task) }}
              >
                <Trash className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {task.status === 'completed' && (
          <>
            {isVideo && videoFailed
              ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <TimerOff className="size-6 opacity-50" />
                    <p className="text-xs opacity-60">视频已过期，请重新生成</p>
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
                  <button type="button" className="block size-full text-left" onClick={onMediaClick}>
                    {isVideo && task.videoUrl
                      ? (
                          <video
                            src={cachedVideoSrc}
                            preload="metadata"
                            muted
                            playsInline
                            loop
                            className="size-full object-cover"
                            onMouseEnter={onVideoEnter}
                            onMouseLeave={onVideoLeave}
                            onError={() => setVideoFailed(true)}
                          />
                        )
                      : task.imageUrl
                        ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={task.imageUrl}
                              alt={task.revisedPrompt || task.prompt}
                              loading="lazy"
                              decoding="async"
                              className="size-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          )
                        : null}
                  </button>
                )}

            {state.batchMode && hasMedia
              ? (
                  <div className="absolute top-2 left-2">
                    <span
                      className={`flex size-6 items-center justify-center rounded-full border-2 transition ${
                        isBatchSelected
                          ? 'border-(--app-primary) bg-(--app-primary) text-white'
                          : 'border-white/80 bg-black/30 text-transparent'
                      }`}
                    >
                      <Check className="size-3.5" />
                    </span>
                  </div>
                )
              : (
                  <div className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    {isVideo ? <Clapperboard className="size-3" /> : <ImageIcon className="size-3" />}
                    {isVideo ? '视频' : '图片'}
                  </div>
                )}

            {!state.batchMode && (
              <div
                className={`absolute top-2 right-2 flex gap-1 transition ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100'}`}
              >
                <Tooltip.Root>
                  <Tooltip.Trigger<'button'>
                    aria-label="预览"
                    className={overlayBtnClass}
                    onClick={() => previewMediaTask(task)}
                    render={props => <button type="button" {...props} />}
                  >
                    <Eye className="size-3.5" />
                  </Tooltip.Trigger>
                  <Tooltip.Content placement="top" className={tooltipClass}>预览</Tooltip.Content>
                </Tooltip.Root>

                <Dropdown.Root isOpen={menuOpen} onOpenChange={setMenuOpen}>
                  <Tooltip.Root>
                    <Dropdown.Trigger aria-label="更多操作" className={overlayBtnClass}>
                      <Ellipsis className="size-3.5" />
                    </Dropdown.Trigger>
                    <Tooltip.Content placement="top" className={tooltipClass}>更多操作</Tooltip.Content>
                  </Tooltip.Root>

                  <Dropdown.Popover placement="bottom end" offset={4} className="glass-panel w-44 min-w-0">
                    <Dropdown.Menu aria-label="任务操作" className="p-1">
                      {menuGroups.flatMap((group, groupIndex) => [
                        ...(groupIndex > 0
                          ? [<Separator key={`sep-${groupIndex}`} className="my-1 ms-0 w-full bg-black/5 dark:bg-white/10" />]
                          : []),
                        ...group.map(item => (
                          <Dropdown.Item
                            key={item.label}
                            textValue={item.label}
                            isDisabled={item.disabled}
                            onAction={item.onSelect}
                            className={`glass-pill flex min-h-0 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium data-disabled:cursor-not-allowed data-disabled:opacity-40 ${
                              item.danger ? 'text-red-500 hover:text-red-600' : ''
                            }`}
                          >
                            <item.Icon className="size-3.5 shrink-0" />
                            {item.label}
                          </Dropdown.Item>
                        ))
                      ])}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown.Root>
              </div>
            )}

            {isVideo && task.videoUrl && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-white backdrop-blur">
                {task.duration || ''}s
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="label-mono truncate">{metaText}</p>
          <p className="mt-0.5 truncate text-[11px] opacity-50">
            {formatTaskCreatedAt(task)}
            {task.durationSeconds ? ` · 耗时 ${task.durationSeconds}s` : ''}
            {task.costUsd ? ` · $${task.costUsd.toFixed(3).replace(/\.?0+$/, '')}` : ''}
          </p>
        </div>
        <span className="glass-chip shrink-0 px-2 py-0.5 text-[10px] font-semibold">
          {task.type === 'edit' ? (isVideo ? '图生视频' : '编辑') : '生成'}
        </span>
      </div>
    </article>
  )
}
