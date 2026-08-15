#!/usr/bin/env node
// 跨端共享层同步:shared/utils/* → web-next/src/lib/shared/*
//
// 为什么需要它:两端各存一份副本(web-next 不在 pnpm workspace 内,且 docker.yml
// 的 build-web-next 用 context: web-next,构建上下文根本看不到仓库根的 shared/,
// 所以"直接 import 根目录"这条路走不通)。手工双写已经出过事——2026-08-10 只改了
// 前端一侧,gpt-image/grok 的 cost* 字段漂了两天,展示价与结算价脱钩;这类漂移不
// 报错、不被任何检查拦住,只会安静地算错钱。
//
// 用法:
//   node scripts/sync-shared.mjs           复制(以 shared/ 为准覆盖前端副本)
//   node scripts/sync-shared.mjs --check    只校验,不一致则退出码 1(CI 用)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const root = new URL('../', import.meta.url)

/** 可整体复制的文件:源 → 目标(前端目录用 kebab-case 命名) */
const MIRRORED = [
  { from: 'shared/utils/mediaModels.ts', to: 'web-next/src/lib/shared/media-models.ts', note: '媒体模型目录(能力/价格/默认分组的单一事实源)' },
  { from: 'shared/utils/errors.ts', to: 'web-next/src/lib/shared/errors.ts', note: '请求错误类型' },
  { from: 'shared/utils/models.ts', to: 'web-next/src/lib/shared/models.ts', note: '聊天模型目录' },
  { from: 'shared/utils/reasoning.ts', to: 'web-next/src/lib/shared/reasoning.ts', note: '思考强度档位' }
]

/** images.ts 两端有意分叉(前端不要 Nuxt 的 icon 字段与服务端专用的 buildImagePrompt),
 *  不能整体复制;但其中这些常量必须逐字一致,否则前端算出的 size 与服务端对不上 */
const IMAGES = {
  from: 'shared/utils/images.ts',
  to: 'web-next/src/lib/shared/images.ts',
  blocks: ['imageRatios', 'imageResolutions', 'imageQualities', 'defaultImageQuality', 'imageSizeMap']
}

function read(relative) {
  return readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')
}

function banner(from) {
  return `// 由 scripts/sync-shared.mjs 从 ${from} 自动同步,请勿直接编辑此文件。\n`
    + `// 改动请改源文件后运行:node scripts/sync-shared.mjs\n`
}

function expected(entry) {
  return banner(entry.from) + read(entry.from)
}

/** 取出某个 export const 声明的完整文本(到下一个顶层 export 或文件尾为止) */
function extractBlock(source, name) {
  const start = source.search(new RegExp(`^export const ${name}\\b`, 'm'))
  if (start === -1) return null
  const rest = source.slice(start)
  const nextExport = rest.slice(1).search(/^export (const|function|type|interface)\b/m)
  return (nextExport === -1 ? rest : rest.slice(0, nextExport + 1)).trimEnd()
}

const checkOnly = process.argv.includes('--check')
const problems = []

for (const entry of MIRRORED) {
  const want = expected(entry)
  let actual = ''
  try {
    actual = read(entry.to)
  } catch {
    actual = ''
  }
  if (actual === want) continue

  if (checkOnly) {
    problems.push(`${entry.to} 与 ${entry.from} 不一致(${entry.note})`)
  } else {
    writeFileSync(fileURLToPath(new URL(entry.to, root)), want)
    console.log(`已同步 ${entry.from} → ${entry.to}`)
  }
}

// images.ts:只比对必须一致的常量块
const imagesSource = read(IMAGES.from)
const imagesTarget = read(IMAGES.to)
for (const name of IMAGES.blocks) {
  const a = extractBlock(imagesSource, name)
  const b = extractBlock(imagesTarget, name)
  if (a === null || b === null) {
    problems.push(`images.ts 缺少导出 ${name}(source=${a !== null}, target=${b !== null})`)
    continue
  }
  if (a !== b) {
    problems.push(`images.ts 的 ${name} 两端不一致——前端算出的尺寸会与服务端对不上`)
  }
}

if (problems.length) {
  console.error('共享层不同步:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\n修复:改 shared/utils/ 下的源文件后运行 node scripts/sync-shared.mjs')
  console.error('(images.ts 两端有意分叉,需手工对齐上面列出的常量块)')
  process.exit(1)
}

console.log(checkOnly ? '共享层校验通过' : '共享层同步完成')
