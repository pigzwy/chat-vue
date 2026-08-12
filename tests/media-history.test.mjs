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
