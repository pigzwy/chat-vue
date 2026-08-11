'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, LoaderCircle, Sparkles } from 'lucide-react'
import { loginWithPassword } from '@/lib/models-store'
import { gatewayHomeUrl, loadAppConfig, ssoEntryUrl } from '@/lib/runtime-config'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
      reset: (id: string) => void
    }
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** Cloudflare Turnstile 人机验证(网关开启时登录必须携带其 token) */
function TurnstileBox({ siteKey, onToken }: { siteKey: string, onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let widgetId = ''
    const ensureScript = () => new Promise<void>((resolve) => {
      if (window.turnstile) return resolve()
      const existing = document.querySelector(`script[src="${TURNSTILE_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = TURNSTILE_SRC
      script.async = true
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
    void ensureScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken('')
      })
    })
    return () => {
      cancelled = true
      if (widgetId) {
        try { window.turnstile?.remove(widgetId) } catch { /* 已卸载 */ }
      }
    }
    // onToken 由父组件以稳定引用传入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  return <div ref={ref} className="mt-3 flex justify-center" />
}

interface PublicSettings {
  turnstile_enabled?: boolean
  turnstile_site_key?: string
}

/** 登录页:Pigcode 账号密码登录(经网关公开 auth API);手动贴凭证仅调试通道 */
export function LoginScreen({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [error, setError] = useState(initialError || '')
  const [pending, setPending] = useState(false)
  // null = 配置加载中
  const [cfg, setCfg] = useState<{ sso?: string, home?: string } | null>(null)
  const [settings, setSettings] = useState<PublicSettings | null>(null)

  useEffect(() => {
    let mounted = true
    void loadAppConfig().then(() => {
      if (!mounted) return
      setCfg({ sso: ssoEntryUrl(), home: gatewayHomeUrl() })
    })
    // 网关公开设置:决定是否渲染 Turnstile
    void fetch('/sub2api/api/v1/settings/public')
      .then(async (response) => {
        if (!response.ok || !mounted) return
        const parsed = await response.json().catch(() => null) as { data?: PublicSettings } | PublicSettings | null
        const data = (parsed && 'data' in (parsed as object) ? (parsed as { data?: PublicSettings }).data : parsed) as PublicSettings | null
        if (mounted) setSettings(data || {})
      })
      .catch(() => { if (mounted) setSettings({}) })
    return () => { mounted = false }
  }, [])

  const needTurnstile = Boolean(settings?.turnstile_enabled && settings.turnstile_site_key)
  const canSubmit = email.trim() && password && !pending && (!needTurnstile || turnstileToken)

  async function onPasswordLogin() {
    if (!canSubmit) return
    setPending(true)
    setError('')
    try {
      await loginWithPassword(email.trim(), password, turnstileToken || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败,请重试')
      setPending(false)
      setTurnstileToken('')
    }
  }


  return (
    <div className="aurora-shell flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="glass-panel glass-panel--lg w-full max-w-md rounded-3xl p-7 sm:p-8">
        <div className="glass-orb mx-auto mb-5 flex size-14 items-center justify-center rounded-3xl">
          <Sparkles className="size-6" />
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight">进入创作台</h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-6 opacity-60">
          使用 Pigcode 账号登录,余额与用量自动同步。
        </p>

        {cfg === null || settings === null
          ? (
              <div className="mt-8 flex justify-center">
                <LoaderCircle className="size-5 animate-spin opacity-50" />
              </div>
            )
          : (
              <>
                <div className="mt-6 space-y-3">
                  <input
                    value={email}
                    type="email"
                    autoComplete="email"
                    placeholder="邮箱"
                    className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none"
                    onChange={(event) => { setEmail(event.target.value); setError('') }}
                  />
                  <input
                    value={password}
                    type="password"
                    autoComplete="current-password"
                    placeholder="密码"
                    className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none"
                    onChange={(event) => { setPassword(event.target.value); setError('') }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); void onPasswordLogin() }
                    }}
                  />
                  {needTurnstile && (
                    <TurnstileBox siteKey={settings.turnstile_site_key!} onToken={setTurnstileToken} />
                  )}
                  {error && <p className="text-xs leading-5 text-red-500">{error}</p>}
                  <button
                    type="button"
                    disabled={!canSubmit}
                    className="glass-btn flex h-11 w-full items-center justify-center gap-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => { void onPasswordLogin() }}
                  >
                    {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                    {pending ? '登录中...' : '登录'}
                  </button>
                </div>

                {cfg.home && (
                  <p className="mt-3 flex justify-center gap-4 text-xs opacity-60">
                    <a className="hover:underline" href={`${cfg.home}/register`} target="_blank" rel="noreferrer">注册账号</a>
                    <a className="hover:underline" href={`${cfg.home}/forgot-password`} target="_blank" rel="noreferrer">忘记密码</a>
                  </p>
                )}

                {cfg.sso && (
                  <button
                    type="button"
                    className="glass-pill mt-4 flex h-10 w-full items-center justify-center gap-1.5 text-sm font-semibold"
                    onClick={() => { window.location.href = cfg.sso! }}
                  >
                    已在网关登录?一键进入
                    <ArrowRight className="size-3.5" />
                  </button>
                )}
              </>
            )}

        <p className="mt-4 text-center text-xs leading-5 opacity-45">
          凭证只保存在本浏览器,所有用量计入你的 Pigcode 账户。
        </p>
      </div>
    </div>
  )
}
