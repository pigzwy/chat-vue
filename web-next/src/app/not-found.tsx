'use client'

// SPA 式回落:未知路径一律回首页。Vue 版是 SPA,任意路径都能进应用;
// 外部内嵌/收藏的旧路径(如网关首页 iframe 配的地址)不应见到 404。
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/')
  }, [router])
  return null
}
