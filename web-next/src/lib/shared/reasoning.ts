// 服务端接受的思考强度全集（各模型实际支持的子集由网关 /v1/models 元数据声明，
// UI 按模型动态渲染；auto = 不向上游附加思考强度参数）
export const reasoningEffortValues = ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export type ReasoningEffort = typeof reasoningEffortValues[number]

const reasoningEffortLabels: Record<ReasoningEffort, string> = {
  auto: '默认',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max'
}

/** 模型元数据缺失时的兜底档位（老四档） */
export const reasoningEffortItems: Array<{
  label: string
  value: ReasoningEffort
  icon: string
}> = [
  { label: reasoningEffortLabels.auto, value: 'auto', icon: 'i-lucide-sparkles' },
  { label: reasoningEffortLabels.low, value: 'low', icon: 'i-lucide-gauge' },
  { label: reasoningEffortLabels.medium, value: 'medium', icon: 'i-lucide-brain' },
  { label: reasoningEffortLabels.high, value: 'high', icon: 'i-lucide-brain-circuit' }
]

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (reasoningEffortValues as readonly string[]).includes(value)
}

export function getReasoningEffortLabel(value: ReasoningEffort) {
  return reasoningEffortLabels[value] || 'Auto'
}
