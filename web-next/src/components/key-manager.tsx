'use client'

import { useState } from 'react'
import { Modal } from '@heroui/react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { mediaGroupIds, modelsStore, setManualMediaKeys } from '@/lib/models-store'
import { refreshGroupModels } from '@/lib/studio/media-models-store'
import { toast } from '@/lib/toast'

function maskKey(key: string) {
  if (!key) return '未配置'
  return `${key.slice(0, 6)}····${key.slice(-4)}`
}

/** sk 模式的分组密钥管理:image-2 / Grok / Nano Banana 各配一把,创作台按模型自动路由 */
export function KeyManager() {
  const { manualKey, manualImageKey, manualGrokKey, manualNanoKey } = modelsStore.useStore()
  const [open, setOpen] = useState(false)
  const [imageKey, setImageKey] = useState('')
  const [grokKey, setGrokKey] = useState('')
  const [nanoKey, setNanoKey] = useState('')
  const [pending, setPending] = useState(false)

  // 仅 sk 直连模式需要(JWT 模式下 key 按分组自动创建)
  if (!manualKey) return null

  function openDialog() {
    setImageKey(manualImageKey)
    setGrokKey(manualGrokKey)
    setNanoKey(manualNanoKey)
    setOpen(true)
  }

  async function onSave() {
    if (pending) return
    setPending(true)
    try {
      const changed = await setManualMediaKeys({
        image: imageKey !== manualImageKey ? imageKey : undefined,
        grok: grokKey !== manualGrokKey ? grokKey : undefined,
        nanobanana: nanoKey !== manualNanoKey ? nanoKey : undefined
      })
      if (changed) {
        await refreshGroupModels()
        toast({ title: '密钥已更新', description: '创作台模型清单已按新密钥刷新' })
      }
      setOpen(false)
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : '密钥校验失败', color: 'error' })
    } finally {
      setPending(false)
    }
  }

  const groups = mediaGroupIds()
  const slots = [
    {
      label: `图片密钥(image-2 · 分组 ${groups.openai})`,
      value: imageKey,
      onChange: setImageKey
    },
    {
      label: `Grok 密钥(画图/视频 · 分组 ${groups.grok})`,
      value: grokKey,
      onChange: setGrokKey
    },
    {
      label: groups.nanobanana
        ? `Nano Banana 密钥(分组 ${groups.nanobanana})`
        : 'Nano Banana 密钥(分组未配置:服务端 MEDIA_GROUP_NANOBANANA)',
      value: nanoKey,
      onChange: setNanoKey
    }
  ]

  return (
    <>
      <button
        type="button"
        aria-label="密钥管理"
        title="密钥管理"
        className="glass-chip pointer-events-auto flex size-9 items-center justify-center"
        onClick={openDialog}
      >
        <KeyRound className="size-4" />
      </button>

      <Modal.Backdrop isOpen={open} onOpenChange={setOpen} className="bg-black/30 backdrop-blur-sm">
        <Modal.Container placement="center" className="sm:w-full sm:p-4">
          <Modal.Dialog aria-label="密钥管理" className="glass-panel glass-panel--lg w-full max-w-md rounded-3xl p-6">
            <h2 className="text-lg font-bold">密钥管理</h2>
            <p className="mt-1 text-sm leading-6 opacity-60">
              每把 sk 只属于一个分组。给各分组配上各自的密钥,创作台会按模型自动路由;未配置的回落到主密钥。
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <p className="label-mono mb-1.5">主密钥(对话)</p>
                <p className="glass-pill inline-block px-3 py-1.5 font-mono text-xs">{maskKey(manualKey)}</p>
                <p className="mt-1 text-xs opacity-45">更换主密钥请退出后重新登录</p>
              </div>
              {slots.map(slot => (
                <div key={slot.label}>
                  <p className="label-mono mb-1.5">{slot.label}</p>
                  <input
                    value={slot.value}
                    placeholder="sk-...(留空则用主密钥)"
                    className="glass-input w-full rounded-2xl px-3.5 py-2.5 font-mono text-xs outline-none"
                    onChange={event => slot.onChange(event.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="glass-pill px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                disabled={pending}
                className="glass-btn flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => { void onSave() }}
              >
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                保存
              </button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
