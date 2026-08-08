'use client'

import type { PromptPreset } from '@/lib/presets'

interface PresetRowProps {
  presets: PromptPreset[]
  disabled?: boolean
  center?: boolean
  onSelect: (prompt: string) => void
}

export function PresetRow({ presets, disabled, center, onSelect }: PresetRowProps) {
  return (
    <div className={`flex w-full flex-wrap gap-2 ${center ? 'justify-center' : ''}`}>
      {presets.map(preset => (
        <button
          key={preset.label}
          type="button"
          disabled={disabled}
          className="glass-pill px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onSelect(preset.prompt)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
