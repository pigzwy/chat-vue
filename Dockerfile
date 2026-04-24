FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NUXT_UI_PRO_LICENSE
ENV NUXT_UI_PRO_LICENSE=$NUXT_UI_PRO_LICENSE
COPY . .
RUN pnpm vite build

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3009

RUN addgroup -S app && adduser -S app -G app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build --chown=app:app /app/.output ./.output
RUN mkdir -p .output/server/node_modules/@libsql \
  && native_pkg="$(find node_modules/.pnpm -path '*/node_modules/@libsql/linux-x64-musl' -type d -print -quit)" \
  && test -n "$native_pkg" \
  && cp -R "$native_pkg" .output/server/node_modules/@libsql/linux-x64-musl
RUN mkdir -p /app/.data && chown -R app:app /app/.data

USER app
EXPOSE 3009
VOLUME ["/app/.data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3009)).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
