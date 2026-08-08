'use client'

import { useEffect, useState } from 'react'
import { CircleAlert, Phone, PhoneOff, Settings2, Trash2 } from 'lucide-react'
import { MicVisualizer } from '@/components/voice/mic-visualizer'
import { useHydrated } from '@/hooks/use-hydrated'
import {
  clearVoiceError,
  defaultVoiceModelId,
  deleteVoiceRecord,
  disposeVoice,
  endVoiceCall,
  setLiveGroupId,
  startVoiceCall,
  voiceStore
} from '@/lib/voice/voice-store'

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatRecordTime(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(iso))
}

function GroupConfig({ liveGroupId }: { liveGroupId: number | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  if (!editing) {
    return (
      <button
        type="button"
        className="glass-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
        onClick={() => { setValue(liveGroupId ? String(liveGroupId) : ''); setEditing(true) }}
      >
        <Settings2 className="size-3.5" />
        {liveGroupId ? `语音分组 #${liveGroupId}` : '配置语音分组'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        autoFocus
        inputMode="numeric"
        placeholder="分组 id"
        className="glass-input h-8 w-24 rounded-full px-3 text-center text-xs outline-none"
        onChange={event => setValue(event.target.value.replace(/\D/g, ''))}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditing(false)
          if (event.key === 'Enter') {
            setLiveGroupId(value ? Number(value) : null)
            setEditing(false)
          }
        }}
      />
      <button
        type="button"
        className="glass-btn px-3 py-1.5 text-xs font-semibold"
        onClick={() => { setLiveGroupId(value ? Number(value) : null); setEditing(false) }}
      >
        保存
      </button>
    </div>
  )
}

export default function VoicePage() {
  const hydrated = useHydrated()
  const state = voiceStore.useStore()

  useEffect(() => () => disposeVoice(), [])

  if (!hydrated) {
    return (
      <div className="aurora-shell flex min-h-0 flex-1 items-center justify-center">
        <div className="glass-orb size-14 animate-pulse rounded-3xl" />
      </div>
    )
  }

  const active = state.status === 'active'
  const busy = state.status === 'mic' || state.status === 'connecting'
  const elapsed = active && state.startedAtMs
    ? Math.max(0, Math.round((state.timerNow - state.startedAtMs) / 1000))
    : 0

  const statusText = state.status === 'mic'
    ? '正在请求麦克风...'
    : state.status === 'connecting'
      ? '正在接通...'
      : active
        ? formatDuration(elapsed)
        : '随时开聊'

  return (
    <div className="aurora-shell min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_360px]">
        {/* 通话面板 */}
        <section className="glass-panel glass-panel--lg flex min-h-[70vh] flex-col items-center justify-center gap-6 rounded-3xl p-8">
          <div className="flex items-center gap-2">
            <span className="glass-chip px-3 py-1.5 text-xs font-semibold">{state.model || defaultVoiceModelId}</span>
            <GroupConfig liveGroupId={state.liveGroupId} />
          </div>

          <MicVisualizer active={active} />

          <div className="text-center">
            <p className={`text-2xl font-bold tracking-tight ${active ? 'font-mono' : ''}`}>{statusText}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 opacity-60">
              {active
                ? '全双工通话中,可随时直接插话打断。'
                : '实时语音对话(GPT-Live):点击开始,与 AI 像打电话一样交流。'}
            </p>
          </div>

          {state.error && (
            <div className="flex max-w-md items-start gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-500">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{state.error}</span>
              <button type="button" className="ml-1 shrink-0 text-xs underline opacity-70" onClick={clearVoiceError}>
                知道了
              </button>
            </div>
          )}

          {active || busy
            ? (
                <button
                  type="button"
                  disabled={state.status === 'mic'}
                  className="flex h-14 items-center gap-2 rounded-full bg-red-500 px-8 text-sm font-bold text-white shadow-lg transition hover:bg-red-600 disabled:opacity-60"
                  onClick={endVoiceCall}
                >
                  <PhoneOff className="size-5" />
                  {busy ? '取消' : '挂断'}
                </button>
              )
            : (
                <button
                  type="button"
                  className="glass-btn flex h-14 items-center gap-2 px-8 text-sm font-bold"
                  onClick={() => { void startVoiceCall() }}
                >
                  <Phone className="size-5" />
                  开始通话
                </button>
              )}

          {!state.liveGroupId && !state.error && (
            <p className="label-mono text-center opacity-50">
              网关语音分组开通(AllowLive)后,在上方填入分组 id 即可接通
            </p>
          )}
        </section>

        {/* 通话记录 */}
        <aside className="glass-panel glass-panel--lg flex min-h-0 flex-col rounded-3xl p-4 lg:max-h-[calc(100vh-6rem)]">
          <p className="label-mono px-1 pb-2">通话记录</p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
            {state.records.map(record => (
              <div key={record.id} className="group glass-card-hover rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {record.status === 'completed' ? formatDuration(record.durationSeconds) : '未接通'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="label-mono text-[10px]">{formatRecordTime(record.startedAt)}</span>
                    <button
                      type="button"
                      aria-label="删除记录"
                      className="rounded-full p-1 opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                      onClick={() => deleteVoiceRecord(record.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 truncate text-xs opacity-60">
                  {record.status === 'completed'
                    ? (record.transcript.length ? record.transcript[0]?.text : `${record.model} 语音通话`)
                    : record.error}
                </p>
              </div>
            ))}
            {!state.records.length && (
              <div className="grid place-items-center py-16 text-center">
                <Phone className="size-8 opacity-30" />
                <p className="mt-3 text-sm opacity-50">还没有通话记录</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
