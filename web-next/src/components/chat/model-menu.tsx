'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Check, ChevronDown, CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { modelsStore, selectGroup, setModel, setReasoningEffort } from '@/lib/models-store'
import { isReasoningEffort, reasoningEffortItems } from '@/lib/shared/reasoning'

/** 分组 + 模型 + 思考强度合一的页头菜单（思考档位按模型元数据动态渲染） */
export function ModelMenu() {
  const state = modelsStore.useStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const activeModel = state.models.find(item => item.value === state.model)

  const effortOptions = useMemo(() => {
    const reasoning = activeModel?.reasoning
    if (reasoning?.supported === false) return []
    const declared = (reasoning?.efforts || []).filter(effort => isReasoningEffort(effort.value))
    if (declared.length) {
      return [{ value: 'auto' as const, label: '默认' }, ...declared]
    }
    return reasoningEffortItems.map(item => ({ value: item.value, label: item.label }))
  }, [activeModel])

  useEffect(() => {
    if (effortOptions.length && !effortOptions.some(option => option.value === state.reasoningEffort)) {
      setReasoningEffort('auto')
    }
  }, [effortOptions, state.reasoningEffort])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="glass-pill flex h-9 max-w-56 items-center gap-1.5 px-3 text-sm font-medium"
        onClick={() => setOpen(value => !value)}
      >
        {state.loading
          ? <Loader2 className="size-4 shrink-0 animate-spin" />
          : <Sparkles className="size-4 shrink-0" />}
        <span className="truncate">{activeModel?.label || state.model}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="glass-panel absolute left-0 top-11 z-50 w-80 space-y-3 p-3 animate-fade-scale">
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
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {state.models.map(item => (
                <button
                  key={item.value}
                  type="button"
                  data-selected={state.model === item.value}
                  className="glass-pill flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm font-medium"
                  onClick={() => setModel(item.value)}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {state.model === item.value && <Check className="size-4 shrink-0" />}
                </button>
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
        </div>
      )}
    </div>
  )
}
