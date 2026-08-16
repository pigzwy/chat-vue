// 同步灵感墙案例数据：jamez-bondos/awesome-gpt4o-images → src/data/galleryCases.ts
// 用法：node scripts/sync-gallery.mjs
// 图片走本站代理 /api/gallery-image/*（server/routes/api/gallery-image/[...path].get.ts），
// 兜底 jsDelivr 直链。上游按 cases/<n>/case.yml 逐个探测，连续 miss 15 个即认为到底。
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { parse as parseYaml } from 'yaml'

const REPO = 'jamez-bondos/awesome-gpt4o-images'
const BRANCH = 'main'
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`
const CDN_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}`
const MAX_CASE_PROBE = 400
const MAX_CONSECUTIVE_MISSES = 15
const OUTPUT = new URL('../src/data/galleryCases.ts', import.meta.url)

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'chat-vue-gallery-sync' } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

function excerpt(text, length = 140) {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > length ? `${compact.slice(0, length)}...` : compact
}

function slugify(value) {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

async function loadCase(n) {
  const caseText = await fetchText(`${RAW_BASE}/cases/${n}/case.yml`)
  if (!caseText) return null

  let data
  try {
    data = parseYaml(caseText)
  } catch (error) {
    console.warn(`cases/${n}/case.yml 解析失败，跳过：${error.message}`)
    return { skipped: true }
  }
  if (!data?.image || !(data.prompt || data.prompt_en)) return { skipped: true }

  let attribution = {}
  try {
    const attributionText = await fetchText(`${RAW_BASE}/cases/${n}/ATTRIBUTION.yml`)
    if (attributionText) attribution = parseYaml(attributionText) || {}
  } catch {
    // 版权文件缺失不阻塞
  }

  const title = String(data.title || data.title_en || `案例 ${n}`).trim()
  const prompt = String(data.prompt || data.prompt_en || '').trim()
  const author = String(data.author || attribution.prompt_author || '').trim() || '未知作者'
  const sourceUrl = data.source_links?.[0]?.url || data.author_link || `https://github.com/${REPO}`
  const creationTool = String(attribution.creation_tool || '').trim()
  const imagePath = `cases/${n}/${data.image}`

  return {
    id: `case-${n}-${slugify(String(data.image))}`,
    title,
    category: '精选案例',
    author,
    authorUrl: String(data.author_link || attribution.prompt_author_link || '').trim(),
    sourceUrl,
    imageUrl: `/api/gallery-image/${imagePath}`,
    fallbackImageUrl: `${CDN_BASE}/${imagePath}`,
    prompt,
    promptExcerpt: excerpt(prompt),
    sourceLabel: author,
    tags: creationTool ? [creationTool] : [],
    imageCount: 1,
    searchIndex: [title, data.title_en, author, prompt, data.prompt_en, creationTool]
      .filter(Boolean).join(' ').toLowerCase()
  }
}

const cases = []
let misses = 0
for (let n = 1; n <= MAX_CASE_PROBE; n++) {
  const item = await loadCase(n)
  if (!item) {
    misses++
    if (misses >= MAX_CONSECUTIVE_MISSES) break
    continue
  }
  misses = 0
  if (item.skipped) continue
  cases.push(item)
  if (cases.length % 20 === 0) console.log(`已抓取 ${cases.length} 条...`)
}

if (cases.length < 20) {
  throw new Error(`只抓到 ${cases.length} 条，疑似上游结构变化，放弃写入`)
}

// 新案例排前面
cases.reverse()

const banner = `// 由 scripts/sync-gallery.mjs 生成，请勿手改
// Source repository: https://github.com/${REPO} (CC-BY-4.0)
// Generated at: ${new Date().toISOString()}
`

const interfaceBlock = `export interface GalleryCase {
  id: string
  title: string
  category: string
  author: string
  authorUrl: string
  sourceUrl: string
  imageUrl: string
  fallbackImageUrl: string
  prompt: string
  promptExcerpt: string
  sourceLabel: string
  tags: string[]
  imageCount: number
  searchIndex: string
}
`

const content = `${banner}\n${interfaceBlock}\nexport const galleryCases: GalleryCase[] = ${JSON.stringify(cases, null, 2)}\n`
writeFileSync(OUTPUT, content)
// React 版(独立仓库 pigzwy/pig-studio)用同一份数据,双写保持同步。
// 默认写兄弟目录 ../pig-studio,可用 PIG_STUDIO_DIR 覆盖;不存在则只写本仓库。
const studioGallery = process.env.PIG_STUDIO_DIR
  ? new URL(`${process.env.PIG_STUDIO_DIR.replace(/\/?$/, '/')}src/data/gallery-cases.ts`, `file://${process.cwd()}/`)
  : new URL('../../pig-studio/src/data/gallery-cases.ts', import.meta.url)

if (existsSync(fileURLToPath(studioGallery))) {
  writeFileSync(studioGallery, content)
  console.log(`完成:${cases.length} 条案例写入 src/data/galleryCases.ts 与 pig-studio/src/data/gallery-cases.ts`)
} else {
  console.log(`完成:${cases.length} 条案例写入 src/data/galleryCases.ts`)
  console.log(`前端仓库未找到(${fileURLToPath(studioGallery)}),请在 pig-studio 侧同步该文件。`)
}
