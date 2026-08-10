# 生产切换到 React 版(web-next)

镜像由 GitHub Actions 自动构建推送:

- `llpig/chat-vue-next:latest` — React 前端(main 分支)
- `llpig/chat-vue:latest` — Nitro 后端(原 Vue 镜像,继续负责 /api、/sub2api、媒体任务)

## 服务器上执行(compose 目录,如 /opt/chat-vue)

```bash
# 1. 取最新编排(替换 docker-compose.yml,新增 docker-compose.legacy.yml)
curl -fsSLO https://raw.githubusercontent.com/pigzwy/chat-vue/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/pigzwy/chat-vue/main/docker-compose.legacy.yml

# 2. 拉镜像并切换(.env 不用改;反向代理仍指原端口,无需动)
docker compose pull && docker compose up -d
```

切换后:对外端口(默认 3009)由 React 前端接管;Vue 界面保留在本机回环
`127.0.0.1:3010`(LEGACY_PORT)用于排障。

## 回滚

```bash
docker compose down && docker compose -f docker-compose.legacy.yml up -d
```

或把反向代理临时指回 `127.0.0.1:3010`。

## 登录说明

与 Vue 版一致:粘贴 sub2 网关 JWT 登录,分组 API key 自动创建/复用
(同服务器信任链,会话绑定校验可过)。另支持 sk 直连模式作为兜底,
不同分组的 sk 可在右上角「密钥管理」分槽配置。
