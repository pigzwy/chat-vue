'use client'

import type { ComponentType } from 'react'
import {
  Brain,
  CalendarCheck,
  Camera,
  Clapperboard,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Languages,
  ListChecks,
  Mail,
  Mountain,
  NotebookPen,
  Package,
  Palette,
  PenLine,
  Sparkles,
  SquareCheck,
  Table,
  WandSparkles
} from 'lucide-react'
import type { PromptPreset } from '@/lib/presets'

// 预设 icon 名 → lucide 组件(模块级查表,渲染期禁止函数调用产出组件)
const presetIcons: Record<string, ComponentType<{ className?: string }>> = {
  'brain': Brain,
  'calendar-check': CalendarCheck,
  'camera': Camera,
  'check-square': SquareCheck,
  'clapperboard': Clapperboard,
  'clipboard-list': ClipboardList,
  'file-text': FileText,
  'image': ImageIcon,
  'languages': Languages,
  'list-check': ListChecks,
  'mail': Mail,
  'mountain': Mountain,
  'notebook-pen': NotebookPen,
  'package': Package,
  'palette': Palette,
  'pen-line': PenLine,
  'sparkles': Sparkles,
  'table': Table,
  'wand-sparkles': WandSparkles
}

interface PresetRowProps {
  presets: PromptPreset[]
  disabled?: boolean
  center?: boolean
  onSelect: (prompt: string) => void
}

export function PresetRow({ presets, disabled, center, onSelect }: PresetRowProps) {
  return (
    <div className={`flex w-full flex-wrap gap-2 ${center ? 'justify-center' : ''}`}>
      {presets.map((preset) => {
        const Icon = presetIcons[preset.icon]
        return (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            className="glass-pill flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onSelect(preset.prompt)}
          >
            {Icon && <Icon className={`size-3.5 shrink-0 ${preset.color}`} />}
            {preset.label}
          </button>
        )
      })}
    </div>
  )
}
