# 生产切换到 React 版(web-next)完整步骤

镜像由 GitHub Actions 自动构建推送,服务器只拉不建:

- `llpig/chat-vue-next:latest` — React 前端(对外承接原端口)
- `llpig/chat-vue:latest` — Nitro 后端(原 Vue 镜像,退居内部:/api、/sub2api、媒体任务)

> **不是"只改镜像"**:是单容器 → 双容器拓扑(web 对外 + 原镜像退居后端),
> 由新 docker-compose.yml 描述;`.env` 里的 IMAGE 变量不用动。

## 0. 前提(一次性确认)

```bash
docker network ls | grep app-shared     # 共享网络存在(编排已声明自动加入)
docker ps                               # 记下网关容器名(SUB2API_BASE_URL 要用)
```

## 1. 补 .env(compose 目录,如 /opt/chat-vue)

原有内容保留,补/确认以下几项(全部知识点见 .env.example):

```bash
SUB2API_BASE_URL=http://<网关容器名>:8080   # 或保持你现有的地址不变
MEDIA_GROUP_OPENAI=25        # GPT Image 2 分组
MEDIA_GROUP_GROK=66          # Grok 画图/视频分组
MEDIA_GROUP_NANOBANANA=      # Nano Banana 分组 id(生成管线待接,先占位)
LEGACY_PORT=3010             # Vue 界面的本机回滚口(新增)
# APP_PORT 保持原值(反向代理指向它)
```

## 2. 换编排并切换

```bash
curl -fsSLO https://raw.githubusercontent.com/pigzwy/chat-vue/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/pigzwy/chat-vue/main/docker-compose.legacy.yml
docker compose pull && docker compose up -d
```

反向代理、CDN、域名此步都不用动:对外端口不变,落到端口上的应用换成了 React。

## 3. 验证

- `curl -s 127.0.0.1:${APP_PORT:-3009}/api/app-config` → 能看到配置的分组 id
- 打开原域名 → React 界面;原 JWT 登录态直接继承(存储键与 Vue 一致),
  创作台出模型列表、能正常生成
- Vue 界面仍在 `127.0.0.1:3010` 可直连排障

## 4. 换域名(可选,和切换解耦,先后皆可)

> 切换本身(第 2 步)不碰 Caddy:端口没变,反代不感知应用更换。只有换域名才改。

1. DNS/CDN:新域名按老域名同样的方式解析(Cloudflare 记录指向同一映射/源站)
2. 服务器 Caddyfile 加一个 site block(证书 Caddy 自动签,与老域名同机制):

   ```caddy
   新域名 {
       encode zstd gzip
       reverse_proxy 127.0.0.1:3009
   }
   ```

   老域名想跳转的话,把原 block 换成:

   ```caddy
   老域名 {
       redir https://新域名{uri} permanent
   }
   ```

   然后 `sudo systemctl reload caddy`(或 `caddy reload`)。
3. 新域名验证 OK 后,老域名可保留、301 到新域名、或删除

注意:登录态与聊天/生成历史都存在浏览器 localStorage,**按域名隔离**——
新域名上需要重新登录,本地历史从零开始。

## 无感登录(SSO 接力)

1. 网关部署 `feat/connect-studio` 分支(sub2api-gy 仓库,新增前端路由
   `/connect/studio`:已登录带 token 302 跳入 Studio,未登录先走网关登录再续跳)
2. Studio 服务器 `.env` 配置 `SSO_CONNECT_URL=https://sub2.pigcoder.com/connect/studio`
   并 `docker compose up -d`
3. 网关菜单 iframe、独立 tab、官网首页按钮统一指向 `/connect/studio`

效果:登录页变为「使用 Pigcoder 账号进入」一键跳转(无手动贴凭证入口,
调试机用 `ALLOW_KEY_LOGIN=1` 打开);顶栏显示账户余额(随 60s 心跳刷新,
点击去网关充值/明细);会话过期时猪鼻子变红,点一下即走网关无感续期。

## 回滚

```bash
docker compose down && docker compose -f docker-compose.legacy.yml up -d
```

或把反向代理临时指回 `127.0.0.1:3010`。回滚编排同样声明了 app-shared,不会断网关。

## 数据说明

- 登录态:同域名下 Vue ↔ React 互通(同一存储键),切换/回滚都不用重登
- 聊天记录、创作台历史:两版浏览器本地存储格式不同,**不互通也不迁移**;
  Vue 的记录仍留在浏览器里,回滚即见,不会丢失
- 服务端数据卷 `chat-vue-data`(错误日志等)双方共用,切换不影响
