'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, KeyRound, LoaderCircle, Sparkles } from 'lucide-react'
import { login, loginWithApiKey } from '@/lib/models-store'
import { allowKeyLogin, loadAppConfig, ssoEntryUrl } from '@/lib/runtime-config'

const SSO_AUTO_FLAG = 'studio-sso-auto-tried'

/** 登录页:主路径是网关免登录接力(一键进入);手动粘贴凭证仅在 allowKeyLogin 时展示 */
export function LoginScreen({ initialError }: { initialError?: string }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(initialError || '')
  const [pending, setPending] = useState(false)
  // null = 配置加载中(避免闪错误形态)
  const [cfg, setCfg] = useState<{ sso?: string, manual: boolean } | null>(null)

  useEffect(() => {
    let mounted = true
    void loadAppConfig().then(() => {
      if (!mounted) return
      const sso = ssoEntryUrl()
      const manual = allowKeyLogin() || !sso
      // 纯 SSO 形态下自动跳转一次(sessionStorage 防环:跳回来仍未登录则停在按钮上)
      if (sso && !manual && !window.sessionStorage.getItem(SSO_AUTO_FLAG)) {
        window.sessionStorage.setItem(SSO_AUTO_FLAG, '1')
        window.location.replace(sso)
        return
      }
      setCfg({ sso, manual })
    })
    return () => { mounted = false }
  }, [])

  async function onSubmit() {
    const credential = value.trim().replace(/^Bearer\s+/i, '')
    if (!credential || pending) return
    setPending(true)
    setError('')
    try {
      // 自动识别:sk- 开头走 API Key 直连(不受网关会话绑定影响),其余按 JWT 校验
      if (/^sk-/i.test(credential)) {
        await loginWithApiKey(credential)
      } else {
        await login(credential)
      }
      // 成功后 store 置位,AppShell 会切走登录页
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败,请重试')
      setPending(false)
    }
  }

  return (
    <div className="aurora-shell flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="glass-panel glass-panel--lg w-full max-w-md rounded-3xl p-7 sm:p-8">
        <div className="glass-orb mx-auto mb-5 flex size-14 items-center justify-center rounded-3xl">
          <Sparkles className="size-6" />
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight">进入创作台</h1>

        {cfg === null && (
          <div className="mt-8 flex justify-center">
            <LoaderCircle className="size-5 animate-spin opacity-50" />
          </div>
        )}

        {cfg?.sso && (
          <>
            <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-6 opacity-60">
              使用 Pigcoder 账号登录,余额与用量自动同步。
            </p>
            <button
              type="button"
              className="glass-btn mt-6 flex h-11 w-full items-center justify-center gap-2 text-sm font-bold"
              onClick={() => { window.location.href = cfg.sso! }}
            >
              使用 Pigcoder 账号进入
              <ArrowRight className="size-4" />
            </button>
          </>
        )}

        {cfg?.manual && (
          <div className={cfg.sso ? 'mt-6 border-t border-black/5 pt-5 dark:border-white/10' : 'mt-2'}>
            {!cfg.sso && (
              <p className="mx-auto mb-4 max-w-xs text-center text-sm leading-6 opacity-60">
                粘贴 API Key(sk- 开头)或网关登录 JWT,校验通过即可使用。
              </p>
            )}
            {cfg.sso && <p className="label-mono mb-3 text-center opacity-50">调试通道</p>}
            <label className="label-mono mb-1.5 flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              API Key / 登录 Token
            </label>
            <textarea
              value={value}
              autoFocus={!cfg.sso}
              rows={3}
              placeholder="sk-xxxxxxxx 或 eyJhbGciOi...(JWT)"
              className="glass-input w-full resize-none rounded-2xl px-4 py-3 font-mono text-xs leading-5 outline-none"
              onChange={(event) => { setValue(event.target.value); setError('') }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void onSubmit() }
              }}
            />
            {error && <p className="mt-2 text-xs leading-5 text-red-500">{error}</p>}
            <button
              type="button"
              disabled={!value.trim() || pending}
              className="glass-btn mt-4 flex h-10 w-full items-center justify-center gap-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => { void onSubmit() }}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {pending ? '校验中...' : '登录'}
            </button>
          </div>
        )}

        {cfg && !cfg.manual && error && (
          <p className="mt-4 text-center text-xs leading-5 text-red-500">{error}</p>
        )}

        <p className="mt-4 text-center text-xs leading-5 opacity-45">
          凭证只保存在本浏览器,所有用量计入你的 Pigcoder 账户。
        </p>
      </div>
    </div>
  )
}
