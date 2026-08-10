'use client'

import { useEffect, useMemo, useState } from 'react'
import { Disclosure, Popover } from '@heroui/react'
import { Bot, Check, ChevronDown, CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { AnthropicIcon, GeminiIcon, GrokIcon, OpenaiIcon } from '@/components/brand-icons'
import { modelsStore, selectGroup, setModel, setReasoningEffort, type ModelSelectItem } from '@/lib/models-store'
import { isReasoningEffort, reasoningEffortItems } from '@/lib/shared/reasoning'

/** 模型按厂商归组(菜单里可折叠;顺序按厂商在列表中的首次出现) */
const providerMeta = [
  { key: 'anthropic', label: 'Claude', test: /claude|anthropic/i },
  { key: 'openai', label: 'OpenAI', test: /gpt|dall|openai|codex|^o[134]/i },
  { key: 'google', label: 'Gemini', test: /gemini|google/i },
  { key: 'grok', label: 'Grok', test: /grok|x-ai/i }
] as const

function providerKeyOf(id: string) {
  return providerMeta.find(meta => meta.test.test(id))?.key ?? 'other'
}

function ProviderIcon({ providerKey, className }: { providerKey: string, className?: string }) {
  if (providerKey === 'anthropic') return <AnthropicIcon className={className} />
  if (providerKey === 'openai') return <OpenaiIcon className={className} />
  if (providerKey === 'google') return <GeminiIcon className={className} />
  if (providerKey === 'grok') return <GrokIcon className={className} />
  return <Bot className={className} />
}

function groupModelsByProvider(models: ModelSelectItem[]) {
  const groups: { key: string, label: string, items: ModelSelectItem[] }[] = []
  const index = new Map<string, number>()
  for (const item of models) {
    const key = providerKeyOf(item.value)
    if (!index.has(key)) {
      index.set(key, groups.length)
      groups.push({ key, label: providerMeta.find(meta => meta.key === key)?.label ?? '其他', items: [] })
    }
    groups[index.get(key)!]!.items.push(item)
  }
  return groups
}

/** 分组 + 模型 + 思考强度合一的页头菜单（思考档位按模型元数据动态渲染） */
export function ModelMenu() {
  const state = modelsStore.useStore()
  const [open, setOpen] = useState(false)

  const activeModel = state.models.find(item => item.value === state.model)

  const effortOptions = useMemo(() => {
    const reasoning = activeModel?.reasoning
    if (reasoning?.supported === false) return []
    // grok 系不接受思考强度参数(上游 400),思考与否由 -reasoning 变体决定,不展示档位
    if (/grok|x-ai/i.test(state.model)) return []
    const declared = (reasoning?.efforts || []).filter(effort => isReasoningEffort(effort.value))
    if (declared.length) {
      return [{ value: 'auto' as const, label: '默认' }, ...declared]
    }
    return reasoningEffortItems.map(item => ({ value: item.value, label: item.label }))
  }, [activeModel, state.model])

  useEffect(() => {
    if (effortOptions.length && !effortOptions.some(option => option.value === state.reasoningEffort)) {
      setReasoningEffort('auto')
    }
  }, [effortOptions, state.reasoningEffort])

  return (
    <Popover.Root isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger className="glass-pill flex h-9 max-w-56 cursor-pointer items-center gap-1.5 px-3 text-sm font-medium">
        {state.loading
          ? <Loader2 className="size-4 shrink-0 animate-spin" />
          : <Sparkles className="size-4 shrink-0" />}
        <span className="truncate uppercase tracking-wide">{activeModel?.label || state.model}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </Popover.Trigger>

      {/* 只叠 glass-panel + 尺寸类:utilities 层的 bg/border 清除类会反压 components 层的玻璃底 */}
      <Popover.Content placement="bottom start" offset={6} className="glass-panel w-80">
        <Popover.Dialog className="space-y-3 p-3 outline-none">
          {state.error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-2.5 py-2 text-xs text-red-500">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {state.error}
            </div>
          )}

          {state.groups.length > 0 && (
            <div>
              <p className="label-mono mb-1.5">分组</p>
              <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
                {state.groups.map(group => (
                  <button
                    key={group.value}
                    type="button"
                    data-selected={state.group === group.value}
                    className="glass-pill flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm font-medium"
                    onClick={() => { void selectGroup(group.value) }}
                  >
                    <Bot className="size-4 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    {state.group === group.value && <Check className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="label-mono mb-1.5">模型</p>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {groupModelsByProvider(state.models).map(group => (
                <Disclosure
                  key={group.key}
                  defaultExpanded={group.items.some(item => item.value === state.model)}
                  className="border-none"
                >
                  <Disclosure.Heading>
                    <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left">
                      <ProviderIcon providerKey={group.key} className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.label}</span>
                      <span className="label-mono text-[10px] opacity-50">{group.items.length}</span>
                      <Disclosure.Indicator>
                        <ChevronDown className="size-3.5 opacity-60" />
                      </Disclosure.Indicator>
                    </Disclosure.Trigger>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="flex flex-col gap-0.5 pt-0.5 pl-3">
                      {group.items.map(item => (
                        <button
                          key={item.value}
                          type="button"
                          data-selected={state.model === item.value}
                          className="glass-pill flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm font-medium"
                          onClick={() => setModel(item.value)}
                        >
                          <span className="min-w-0 flex-1 truncate uppercase tracking-wide">{item.label}</span>
                          {state.model === item.value && <Check className="size-4 shrink-0" />}
                        </button>
                      ))}
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
              ))}
            </div>
          </div>

          {effortOptions.length > 0 && (
            <div>
              <p className="label-mono mb-1.5">思考强度</p>
              <div className="flex flex-wrap items-center gap-0.5 rounded-2xl bg-black/5 p-0.5 dark:bg-white/5">
                {effortOptions.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    data-selected={state.reasoningEffort === item.value}
                    className="glass-pill h-7 min-w-14 flex-1 rounded-full px-2 text-xs font-semibold"
                    onClick={() => {
                      if (isReasoningEffort(item.value)) setReasoningEffort(item.value)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  )
}
