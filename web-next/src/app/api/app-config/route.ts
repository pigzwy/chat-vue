import { NextResponse } from 'next/server'

// 运行时配置注入:compose/env 里改分组 id、登录形态即生效,不用重构建镜像。
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
    },
    // 网关免登录接力入口(如 https://sub2.pigcoder.com/connect/studio);配置后登录页走一键进入
    ssoEntry: process.env.SSO_CONNECT_URL || undefined,
    // 是否放开手动粘贴凭证(sk/JWT)入口:生产隐藏,本机调试开(ALLOW_KEY_LOGIN=1)
    allowKeyLogin: process.env.ALLOW_KEY_LOGIN === '1'
  })
}
