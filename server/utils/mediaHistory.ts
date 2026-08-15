import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * 账号级生成历史(服务端,SQLite/.data 卷持久化):
 * 只存 URL(S3 预签名,约 168h 时效)与过期时间,不存图片字节——
 * 本设备的图走前端 IndexedDB 缓存,这张表解决"清缓存/换设备后历史全无"。
 *
 * 身份模型:按提交任务的 API Key 指纹(sha256 前 32 hex)归档;
 * 查询时客户端提交它手上的全部 key,服务端逐把哈希后取并集——
 * "持有 key 即可见对应历史",key 明文不落库。局限:换 key 后旧历史不可见。
 *
 * 存储引擎用 Node 内置 node:sqlite(22.13+ 免 flag):零外部依赖、无原生
 * 绑定,规避 @libsql/client 在 Alpine(musl)镜像上缺 native 包的打包坑;
 * 建表走首次使用时 CREATE TABLE IF NOT EXISTS,无迁移目录需要随镜像分发。
 */

export interface MediaHistoryEntry {
  id: string
  keyHash: string
  kind: 'image' | 'video'
  model: string
  prompt: string
  imageUrl: string
  expiresAt: number
  costUsd?: number
  createdAt: number
}

const defaultUrlTtlHours = 168

export function mediaUrlTtlMs() {
  const hours = Number(process.env.MEDIA_URL_TTL_HOURS || defaultUrlTtlHours)
  return (Number.isFinite(hours) && hours > 0 ? hours : defaultUrlTtlHours) * 3600 * 1000
}

export function hashApiKey(apiKey: string) {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 32)
}

let _db: DatabaseSync | null = null

function useHistoryDb() {
  if (!_db) {
    const path = process.env.MEDIA_HISTORY_DB || '.data/media-history.db'
    mkdirSync(dirname(path), { recursive: true })
    _db = new DatabaseSync(path)
    _db.exec(`CREATE TABLE IF NOT EXISTS media_history (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      image_url TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      cost_usd REAL,
      created_at INTEGER NOT NULL
    )`)
    _db.exec('CREATE INDEX IF NOT EXISTS idx_media_history_key_created ON media_history (key_hash, created_at)')
    _db.exec('CREATE INDEX IF NOT EXISTS idx_media_history_expires ON media_history (expires_at)')
  }
  return _db
}

const cleanupIntervalMs = 30 * 60 * 1000
let lastCleanupAt = 0

/** 删除已过期的行(URL 早已失效,留着只会拖慢查询)。
 *  node:sqlite 是同步 API,每次写入都全表扫会阻塞事件循环,故限频执行。 */
function cleanupExpired(db: DatabaseSync, now: number) {
  if (now - lastCleanupAt < cleanupIntervalMs) return
  lastCleanupAt = now
  try {
    const result = db.prepare('DELETE FROM media_history WHERE expires_at < ?').run(now)
    if (result.changes) console.info('[media-history] cleaned expired rows', { removed: Number(result.changes) })
  } catch (error) {
    console.error('[media-history] cleanup failed', error instanceof Error ? error.message : error)
  }
}

export interface RecordMediaHistoryInput {
  apiKey: string
  kind: 'image' | 'video'
  model: string
  prompt: string
  imageUrl: string
  completedAtMs?: number
  costUsd?: number
  /** 显式过期时间(unix 毫秒,如网关 url_expires_at);缺省按 TTL 推算 */
  expiresAtMs?: number
}

/** 写入一条历史(尽力而为:失败仅记日志,绝不影响生成任务本身) */
export async function recordMediaHistory(input: RecordMediaHistoryInput) {
  try {
    const now = input.completedAtMs ?? Date.now()
    const db = useHistoryDb()
    cleanupExpired(db, now)
    db
      .prepare(`INSERT INTO media_history (id, key_hash, kind, model, prompt, image_url, expires_at, cost_usd, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        randomUUID(),
        hashApiKey(input.apiKey),
        input.kind,
        input.model,
        input.prompt.slice(0, 4000),
        input.imageUrl,
        input.expiresAtMs && input.expiresAtMs > now ? input.expiresAtMs : now + mediaUrlTtlMs(),
        input.costUsd ?? null,
        now
      )
  } catch (error) {
    console.error('[media-history] record failed', error instanceof Error ? error.message : error)
  }
}

export interface QueryMediaHistoryOptions {
  apiKeys: string[]
  limit?: number
  /** 翻页游标:取 created_at 小于该值的记录 */
  before?: number
}

export async function queryMediaHistory(options: QueryMediaHistoryOptions): Promise<MediaHistoryEntry[]> {
  const hashes = [...new Set(options.apiKeys.map(hashApiKey))]
  if (!hashes.length) return []
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 200)

  // 每把 key 各取一个子查询再 UNION:key_hash 等值 + created_at 排序能整段吃
  // (key_hash, created_at) 索引,各自只读 limit 行。写成 key_hash IN (...) 的话
  // SQLite 无法沿索引出序,会退化成「读全该账号所有行 → 临时 B 树排序 → 再 LIMIT」,
  // 而 node:sqlite 是同步 API,行数一多就把事件循环连同流式聊天一起卡住。
  const columns = 'id, key_hash, kind, model, prompt, image_url, expires_at, cost_usd, created_at'
  const hasCursor = Boolean(options.before && Number.isFinite(options.before))
  const args: Array<string | number> = []
  const branches = hashes.map((hash) => {
    args.push(hash)
    if (hasCursor) args.push(options.before as number)
    args.push(limit)
    // 分支自带 ORDER BY/LIMIT 必须各自包一层子查询,否则 SQLite 语法报错
    return `SELECT * FROM (SELECT ${columns} FROM media_history WHERE key_hash = ?${hasCursor ? ' AND created_at < ?' : ''} ORDER BY created_at DESC LIMIT ?)`
  })
  args.push(limit)

  const rows = useHistoryDb()
    .prepare(`SELECT ${columns} FROM (${branches.join(' UNION ALL ')}) ORDER BY created_at DESC LIMIT ?`)
    .all(...args) as Array<Record<string, unknown>>

  return rows.map(row => ({
    id: String(row.id),
    keyHash: String(row.key_hash),
    kind: (row.kind === 'video' ? 'video' : 'image'),
    model: String(row.model),
    prompt: String(row.prompt),
    imageUrl: String(row.image_url),
    expiresAt: Number(row.expires_at),
    costUsd: row.cost_usd == null ? undefined : Number(row.cost_usd),
    createdAt: Number(row.created_at)
  }))
}
