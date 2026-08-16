FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# 只构建 Nitro 后端(Vue 前端已移除,React 前端在 pigzwy/pig-studio)
RUN pnpm vite build

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3009

RUN addgroup -S app && adduser -S app -G app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build --chown=app:app /app/.output ./.output
# 预建数据目录并交给运行用户:named volume 首挂载会继承镜像内属主,
# 否则 dockerd 以 root 建空目录,app 用户写不进(错误日志/历史库都会静默失败)。
# 存量卷需一次性 docker exec -u root <容器> chown -R app:app /app/.data
RUN mkdir -p /app/.data && chown app:app /app/.data

USER app
EXPOSE 3009
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3009)).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
