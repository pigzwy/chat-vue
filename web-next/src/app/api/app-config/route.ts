import { NextResponse } from 'next/server'

// 运行时配置注入:compose/env 里改分组 id 即生效,不用重构建镜像。
// 静态段路由优先于 /api/[...path] 兜底代理,不会被转发到 Nitro。
export const dynamic = 'force-dynamic'

function groupId(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function GET() {
  return NextResponse.json({
    mediaGroups: {
      openai: groupId(process.env.MEDIA_GROUP_OPENAI),
      grok: groupId(process.env.MEDIA_GROUP_GROK),
      nanobanana: groupId(process.env.MEDIA_GROUP_NANOBANANA)
    }
  })
}
