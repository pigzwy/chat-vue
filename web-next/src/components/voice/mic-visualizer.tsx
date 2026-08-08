'use client'

import { useEffect, useRef } from 'react'
import { getVoiceAnalyser } from '@/lib/voice/voice-store'

/** 通话中按麦克风电平驱动的呼吸环(rAF 直接写 DOM,不进 React 状态) */
export function MicVisualizer({ active }: { active: boolean }) {
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const analyser = getVoiceAnalyser()
    const ring = ringRef.current
    if (!analyser || !ring) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (const v of data) sum += v
      const level = Math.min(1, sum / data.length / 140)
      ring.style.transform = `scale(${1 + level * 0.35})`
      ring.style.opacity = String(0.35 + level * 0.5)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  return (
    <div className="relative flex size-36 items-center justify-center">
      <div
        ref={ringRef}
        className="absolute inset-0 rounded-full bg-[var(--app-primary)]/15 transition-transform duration-75"
      />
      <div className={`glass-orb relative flex size-24 items-center justify-center rounded-full ${active ? '' : 'animate-pulse'}`}>
        <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      </div>
    </div>
  )
}
