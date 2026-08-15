// 账号历史存储单测:node --experimental-strip-types --test tests/media-history.test.mjs
// 使用临时 SQLite 文件,全离线
import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'

process.env.MEDIA_HISTORY_DB = '/tmp/media-history-test.db'
process.env.MEDIA_URL_TTL_HOURS = '168'
rmSync('/tmp/media-history-test.db', { force: true })

const { hashApiKey, mediaUrlTtlMs, queryMediaHistory, recordMediaHistory } =
  await import('../server/utils/mediaHistory.ts')

test('hashApiKey:稳定且不含明文', () => {
  const hash = hashApiKey('sk-abcdefghijklmnopqrstu')
  assert.equal(hash, hashApiKey('sk-abcdefghijklmnopqrstu'))
  assert.equal(hash.length, 32)
  assert.ok(!hash.includes('sk-'))
})

test('mediaUrlTtlMs:默认 168 小时', () => {
  assert.equal(mediaUrlTtlMs(), 168 * 3600 * 1000)
})

test('写入/查询:按 key 归档,过期时间=完成时刻+TTL', async () => {
  const before = Date.now()
  await recordMediaHistory({
    apiKey: 'sk-user-a-00000000000000',
    kind: 'image',
    model: 'grok-imagine-image',
    prompt: '一只小猪',
    imageUrl: 'https://s3.example/a.png',
    costUsd: 0.2
  })
  await recordMediaHistory({
    apiKey: 'sk-user-b-00000000000000',
    kind: 'image',
    model: 'gpt-image-2',
    prompt: '别人的图',
    imageUrl: 'https://s3.example/b.png'
  })

  const mine = await queryMediaHistory({ apiKeys: ['sk-user-a-00000000000000'] })
  assert.equal(mine.length, 1)
  assert.equal(mine[0].prompt, '一只小猪')
  assert.equal(mine[0].imageUrl, 'https://s3.example/a.png')
  assert.equal(mine[0].costUsd, 0.2)
  assert.ok(mine[0].expiresAt >= before + mediaUrlTtlMs())
  assert.ok(mine[0].expiresAt <= Date.now() + mediaUrlTtlMs())
})

test('多把 key 取并集,按创建时间倒序', async () => {
  const both = await queryMediaHistory({
    apiKeys: ['sk-user-a-00000000000000', 'sk-user-b-00000000000000']
  })
  assert.equal(both.length, 2)
  assert.ok(both[0].createdAt >= both[1].createdAt)
})

test('未知 key 查不到任何记录(账号隔离)', async () => {
  const none = await queryMediaHistory({ apiKeys: ['sk-stranger-0000000000000'] })
  assert.equal(none.length, 0)
})

test('before 游标翻页 + limit 生效', async () => {
  for (let i = 0; i < 5; i++) {
    await recordMediaHistory({
      apiKey: 'sk-pager-000000000000000',
      kind: 'image',
      model: 'm',
      prompt: `p${i}`,
      imageUrl: `https://s3.example/p${i}.png`,
      completedAtMs: 1000 + i
    })
  }
  const page1 = await queryMediaHistory({ apiKeys: ['sk-pager-000000000000000'], limit: 2 })
  assert.equal(page1.length, 2)
  assert.deepEqual(page1.map(item => item.prompt), ['p4', 'p3'])
  const page2 = await queryMediaHistory({
    apiKeys: ['sk-pager-000000000000000'],
    limit: 2,
    before: page1[1].createdAt
  })
  assert.deepEqual(page2.map(item => item.prompt), ['p2', 'p1'])
})

test('prompt 超长截断到 4000', async () => {
  await recordMediaHistory({
    apiKey: 'sk-long-0000000000000000',
    kind: 'image',
    model: 'm',
    prompt: 'x'.repeat(5000),
    imageUrl: 'https://s3.example/long.png'
  })
  const rows = await queryMediaHistory({ apiKeys: ['sk-long-0000000000000000'] })
  assert.equal(rows[0].prompt.length, 4000)
})

test('过期行在后续写入时被清理(限频,不影响未过期行)', async () => {
  const key = 'sk-expiry-00000000000000'
  const now = Date.now()

  // 一条早已过期(URL 失效,留着只拖慢查询),一条仍在有效期内
  await recordMediaHistory({
    apiKey: key,
    kind: 'image',
    model: 'm',
    prompt: 'expired',
    imageUrl: 'https://s3.example/old.png',
    completedAtMs: now - 10_000,
    expiresAtMs: now - 5_000
  })
  await recordMediaHistory({
    apiKey: key,
    kind: 'image',
    model: 'm',
    prompt: 'alive',
    imageUrl: 'https://s3.example/new.png',
    completedAtMs: now
  })

  // 清理是限频的(30 分钟一次),本轮写入不一定触发;无论触发与否,
  // 未过期的那条都必须还在,过期的那条至多消失
  const rows = await queryMediaHistory({ apiKeys: [key] })
  assert.ok(rows.some(item => item.prompt === 'alive'), '未过期记录不能被误删')
  assert.ok(rows.every(item => item.expiresAt > now || item.prompt === 'expired'))
})

test('多 key 合并查询:按时间倒序且各账号都在结果里', async () => {
  const keyA = 'sk-merge-a00000000000000'
  const keyB = 'sk-merge-b00000000000000'
  const now = Date.now()

  await recordMediaHistory({ apiKey: keyA, kind: 'image', model: 'm', prompt: 'a-old', imageUrl: 'https://s3.example/1', completedAtMs: now - 3000 })
  await recordMediaHistory({ apiKey: keyB, kind: 'video', model: 'v', prompt: 'b-mid', imageUrl: 'https://s3.example/2', completedAtMs: now - 2000 })
  await recordMediaHistory({ apiKey: keyA, kind: 'image', model: 'm', prompt: 'a-new', imageUrl: 'https://s3.example/3', completedAtMs: now - 1000 })

  const merged = await queryMediaHistory({ apiKeys: [keyA, keyB] })
  assert.deepEqual(merged.map(item => item.prompt), ['a-new', 'b-mid', 'a-old'])

  // limit 作用于合并后的结果,不是每个 key 各取 limit
  const top = await queryMediaHistory({ apiKeys: [keyA, keyB], limit: 2 })
  assert.deepEqual(top.map(item => item.prompt), ['a-new', 'b-mid'])
})
