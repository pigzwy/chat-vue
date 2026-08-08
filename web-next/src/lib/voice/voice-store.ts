// 语音工作台:实时语音通话(网关 /v1/live,WebRTC)
// 架子先行:通话状态机/记录/真实 SDP 握手已就位;网关分组开通 AllowLive 并在
// 页面填入分组 id 后即可真实通话。边带 WS(实时字幕/事件)留待网关开通后接入。
import { createStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { getApiKeyForGroup } from '@/lib/models-store'
import { mediaApiKeyName } from '@/lib/shared/media-models'

export type VoiceCallStatus = 'idle' | 'mic' | 'connecting' | 'active'

export interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  at: number
}

export interface VoiceCallRecord {
  id: string
  model: string
  startedAt: string
  durationSeconds: number
  status: 'completed' | 'failed'
  error?: string
  transcript: TranscriptEntry[]
}

export interface VoiceState {
  status: VoiceCallStatus
  error: string
  model: string
  liveGroupId: number | null
  callId: string
  startedAtMs: number
  timerNow: number
  transcript: TranscriptEntry[]
  records: VoiceCallRecord[]
}

const RECORDS_KEY = 'sub2api-voice-calls'
const GROUP_KEY = 'sub2api-live-group'
const MODEL_KEY = 'sub2api-voice-model'
const recordLimit = 50

export const defaultVoiceModelId = 'gpt-live'

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function initialState(): VoiceState {
  const group = readJson<number | null>(GROUP_KEY, null)
  return {
    status: 'idle',
    error: '',
    model: readJson<string>(MODEL_KEY, defaultVoiceModelId),
    liveGroupId: typeof group === 'number' && group > 0 ? group : null,
    callId: '',
    startedAtMs: 0,
    timerNow: 0,
    transcript: [],
    records: readJson<VoiceCallRecord[]>(RECORDS_KEY, [])
  }
}

export const voiceStore = createStore<VoiceState>(initialState(), {
  serverSnapshot: {
    status: 'idle',
    error: '',
    model: defaultVoiceModelId,
    liveGroupId: null,
    callId: '',
    startedAtMs: 0,
    timerNow: 0,
    transcript: [],
    records: []
  }
})

function patch(partial: Partial<VoiceState>) {
  voiceStore.set(prev => ({ ...prev, ...partial }))
}

// 通话期资源(模块级,不进 state)
let peerConnection: RTCPeerConnection | null = null
let micStream: MediaStream | null = null
let remoteAudio: HTMLAudioElement | null = null
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let durationTimer: ReturnType<typeof setInterval> | null = null

/** 供可视化组件读取麦克风电平(通话中非空) */
export function getVoiceAnalyser() {
  return analyser
}

export function setLiveGroupId(id: number | null) {
  patch({ liveGroupId: id, error: '' })
  writeJson(GROUP_KEY, id)
}

export function setVoiceModel(model: string) {
  patch({ model })
  writeJson(MODEL_KEY, model)
}

export function clearVoiceError() {
  patch({ error: '' })
}

function saveRecord(record: VoiceCallRecord) {
  const records = [record, ...voiceStore.get().records].slice(0, recordLimit)
  patch({ records })
  writeJson(RECORDS_KEY, records)
}

export function deleteVoiceRecord(id: string) {
  const records = voiceStore.get().records.filter(item => item.id !== id)
  patch({ records })
  writeJson(RECORDS_KEY, records)
}

function friendlyLiveError(status: number, raw: string) {
  if (/not supported for this platform/i.test(raw)) {
    return '该分组不是 OpenAI 平台分组,无法用于语音通话,请换一个分组 id'
  }
  if (status === 403 || /not enabled for this group/i.test(raw)) {
    return '网关尚未给该分组开通语音(AllowLive)。架子已就绪,管理后台开通后即可通话'
  }
  if (status === 401) return '密钥无效,请重新登录后重试'
  if (status === 429) return '语音并发已满,请稍后再试'
  return raw || `通话建立失败(${status})`
}

function cleanupCallResources() {
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
  peerConnection?.close()
  peerConnection = null
  micStream?.getTracks().forEach(track => track.stop())
  micStream = null
  if (remoteAudio) {
    remoteAudio.srcObject = null
    remoteAudio = null
  }
  void audioContext?.close().catch(() => {})
  audioContext = null
  analyser = null
}

/** 等待 ICE 候选收集完成(带超时),让 offer 携带完整候选 */
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 2000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timer)
        resolve()
      }
    })
  })
}

export async function startVoiceCall() {
  const state = voiceStore.get()
  if (state.status !== 'idle') return
  if (!state.liveGroupId) {
    patch({ error: '请先在下方填写语音分组 id(网关开通 AllowLive 的 OpenAI 分组)' })
    return
  }

  patch({ status: 'mic', error: '', transcript: [] })
  const startedAtMs = Date.now()

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    patch({ status: 'idle', error: '麦克风授权被拒绝,请在浏览器设置中允许后重试' })
    return
  }

  patch({ status: 'connecting' })

  try {
    const apiKey = await getApiKeyForGroup(state.liveGroupId, mediaApiKeyName)

    peerConnection = new RTCPeerConnection()
    micStream.getTracks().forEach((track) => {
      peerConnection?.addTrack(track, micStream!)
    })
    peerConnection.addEventListener('track', (event) => {
      remoteAudio = new Audio()
      remoteAudio.autoplay = true
      remoteAudio.srcObject = event.streams[0] ?? new MediaStream([event.track])
      void remoteAudio.play().catch(() => {})
    })

    // 本地麦克风电平,供波形可视化
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(micStream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    await waitForIceGathering(peerConnection)
    const localSdp = peerConnection.localDescription?.sdp
    if (!localSdp) throw new Error('本地 SDP 创建失败')

    const formData = new FormData()
    formData.set('sdp', localSdp)
    formData.set('session', JSON.stringify({ model: state.model }))

    const response = await fetch('/sub2api/v1/live', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    })
    const text = await response.text()
    if (!response.ok) {
      let message = text
      try {
        const parsed = JSON.parse(text)
        message = parsed.error?.message || parsed.message || text
      } catch { /* 非 JSON 保留原文 */ }
      throw Object.assign(new Error(friendlyLiveError(response.status, message)), { handled: true })
    }

    const callId = response.headers.get('Location')?.split('/').pop() || ''
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: text })

    patch({ status: 'active', callId, startedAtMs, timerNow: Date.now() })
    durationTimer = setInterval(() => patch({ timerNow: Date.now() }), 1000)

    peerConnection.addEventListener('connectionstatechange', () => {
      const cs = peerConnection?.connectionState
      if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
        if (voiceStore.get().status === 'active') endVoiceCall()
      }
    })
    // TODO(边带): 网关开通后接 GET /v1/live/{callId} WebSocket,
    // 事件流驱动 transcript(实时字幕)与服务端挂断信号
  } catch (error) {
    cleanupCallResources()
    const message = error instanceof Error ? error.message : '通话建立失败'
    patch({ status: 'idle', error: message })
    saveRecord({
      id: crypto.randomUUID(),
      model: state.model,
      startedAt: new Date(startedAtMs).toISOString(),
      durationSeconds: 0,
      status: 'failed',
      error: message,
      transcript: []
    })
  }
}

export function endVoiceCall() {
  const state = voiceStore.get()
  if (state.status === 'idle') return

  const durationSeconds = state.startedAtMs
    ? Math.max(1, Math.round((Date.now() - state.startedAtMs) / 1000))
    : 0

  cleanupCallResources()

  if (state.status === 'active') {
    saveRecord({
      id: crypto.randomUUID(),
      model: state.model,
      startedAt: new Date(state.startedAtMs).toISOString(),
      durationSeconds,
      status: 'completed',
      transcript: state.transcript
    })
    toast({ title: '通话已结束', description: `本次时长 ${durationSeconds} 秒` })
  }

  patch({ status: 'idle', callId: '', startedAtMs: 0, transcript: [] })
}

/** 离开页面时兜底释放麦克风/连接 */
export function disposeVoice() {
  if (voiceStore.get().status !== 'idle') endVoiceCall()
}
