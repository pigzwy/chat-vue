export const reasoningEffortValues = ['auto', 'low', 'medium', 'high'] as const

export type ReasoningEffort = typeof reasoningEffortValues[number]

export const reasoningEffortItems: Array<{
  label: string
  value: ReasoningEffort
  icon: string
}> = [
  { label: 'Auto', value: 'auto', icon: 'i-lucide-sparkles' },
  { label: 'Low', value: 'low', icon: 'i-lucide-gauge' },
  { label: 'Medium', value: 'medium', icon: 'i-lucide-brain' },
  { label: 'High', value: 'high', icon: 'i-lucide-brain-circuit' }
]

export function getReasoningEffortLabel(value: ReasoningEffort) {
  return reasoningEffortItems.find(item => item.value === value)?.label || 'Auto'
}
