#!/usr/bin/env bash
# web-next 本机部署:构建 → 同步到 .deploy 暂存目录 → 重启容器
# (容器只挂 .deploy,构建重建 .next 不会碰到挂载点,避免产物损坏)
set -euo pipefail
cd "$(dirname "$0")/../web-next"

NODE_OPTIONS='--max-old-space-size=2048' pnpm run build

mkdir -p .deploy
rsync -a --delete .next/standalone/ .deploy/standalone/
rsync -a --delete .next/static/ .deploy/static/
rsync -a --delete public/ .deploy/public/

cd ..
docker compose -f docker-compose.next.yml up -d web-next
docker compose -f docker-compose.next.yml restart web-next
echo "deployed: https://studio.pigvibe.com"
