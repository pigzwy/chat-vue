'use client'

import { useState } from 'react'
import { KeyRound, LoaderCircle, Sparkles } from 'lucide-react'
import { login } from '@/lib/models-store'

/** 登录页:粘贴 sub2.pigcoder.com 会话 JWT,校验有效后进入工作台 */
export function LoginScreen({ initialError }: { initialError?: string }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(initialError || '')
  const [pending, setPending] = useState(false)

  async function onSubmit() {
    const token = value.trim()
    if (!token || pending) return
    setPending(true)
    setError('')
    try {
      await login(token)
      // 成功后 store.token 置位,AppShell 会切走登录页
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
        <h1 className="text-center text-2xl font-bold tracking-tight">登录工作台</h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-6 opacity-60">
          粘贴 sub2.pigcoder.com 的登录 Token（Authorization 里的 JWT），校验通过即可使用对话与创作台。
        </p>

        <div className="mt-6">
          <label className="label-mono mb-1.5 flex items-center gap-1.5">
            <KeyRound className="size-3.5" />
            登录 Token
          </label>
          <textarea
            value={value}
            autoFocus
            rows={4}
            placeholder="eyJhbGciOi... 或 Bearer eyJhbGciOi..."
            className="glass-input w-full resize-none rounded-2xl px-4 py-3 font-mono text-xs leading-5 outline-none"
            onChange={(event) => { setValue(event.target.value); setError('') }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void onSubmit() }
            }}
          />
          {error && <p className="mt-2 text-xs leading-5 text-red-500">{error}</p>}
        </div>

        <button
          type="button"
          disabled={!value.trim() || pending}
          className="glass-btn mt-5 flex h-11 w-full items-center justify-center gap-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => { void onSubmit() }}
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {pending ? '校验中...' : '登录'}
        </button>

        <p className="mt-4 text-center text-xs leading-5 opacity-45">
          Token 只保存在本浏览器,用于向网关证明身份。可从 sub2.pigcoder.com 登录后的请求头获取。
        </p>
      </div>
    </div>
  )
}
