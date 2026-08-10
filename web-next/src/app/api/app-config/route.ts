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
    // 网关站点根:登录页的注册/忘记密码、余额胶囊的充值/明细都跳它
    gatewayOrigin: process.env.GATEWAY_ORIGIN || undefined,
    // 网关免登录接力入口(可选,如 https://sub2.pigcoder.com/connect/studio)
    ssoEntry: process.env.SSO_CONNECT_URL || undefined
  })
}
