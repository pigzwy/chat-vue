# 生产切换到 React 版(web-next)

镜像由 GitHub Actions 自动构建推送:

- `llpig/chat-vue-next:latest` — React 前端(main 分支)
- `llpig/chat-vue:latest` — Nitro 后端(原 Vue 镜像,继续负责 /api、/sub2api、媒体任务)

## 配置(.env,全部知识点见 .env.example)

```bash
# 网关地址三种形态任选:
SUB2API_BASE_URL=https://sub2.pigcoder.com          # 公网
#SUB2API_BASE_URL=http://host.docker.internal:8080  # 同机宿主端口
#SUB2API_BASE_URL=http://<网关容器名>:8080           # 同 docker 网络(见下)

# 创作台分组 id(运行时注入,改完 up -d 即生效,不用重构建)
MEDIA_GROUP_OPENAI=25       # GPT Image 2 分组
MEDIA_GROUP_GROK=66         # Grok 画图/视频分组
MEDIA_GROUP_NANOBANANA=     # Nano Banana 分组(生成管线待接,先占位)
```

**docker 网络**:编排已声明 chat-vue 加入外部网络 `app-shared`(每次 up 自动接上,
取代以前手动的 `docker network connect app-shared chat-vue`——手动连接在容器重建后
会丢失)。网关容器也在 app-shared 上时,SUB2API_BASE_URL 直接写它的容器名。
若服务器上没有这个网络:`docker network create app-shared`,或从两份 compose 里
删掉 app-shared 相关两处。

分组 id 生效顺序:浏览器 localStorage 显式覆盖 > 服务端 .env > 内置默认(25/66)。
生效验证:打开 `/api/app-config` 应能看到配置的分组 id;sk 模式下右上角
「密钥管理」每个槽位也会显示当前解析到的分组。

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
