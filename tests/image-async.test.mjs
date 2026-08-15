// 异步生图接入单测:node --experimental-strip-types --test tests/image-async.test.mjs
// 全离线:fetch / DNS / sleep 均注入 mock
import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

const {
  AsyncImageUnsupportedError,
  isGeminiAsyncFallbackError,
  pollAsyncImageResult,
  resolveAsyncPollUrl,
  submitAsyncImageGeneration
} = await import('../server/utils/imageAsyncUpstream.ts')
const { downloadImageAsBase64, isPrivateAddress } = await import('../server/utils/safeImageDownload.ts')

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  })
}

const noSleep = () => Promise.resolve()

// ==================== submit ====================

test('submit:202 返回 task_id/poll_url,Retry-After 转毫秒', async () => {
  const calls = []
  const result = await submitAsyncImageGeneration({
    baseUrl: 'https://gw.example/v1',
    apiKey: 'sk-test',
    body: '{"model":"m"}',
    fetchImpl: async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization })
      return jsonResponse(
        { task_id: 't-1', status: 'processing', poll_url: '/v1/images/generations/async/t-1' },
        { status: 202, headers: { 'Retry-After': '3' } }
      )
    }
  })
  assert.equal(result.taskId, 't-1')
  assert.equal(result.retryAfterMs, 3000)
  assert.equal(calls[0].url, 'https://gw.example/v1/images/generations/async')
  assert.equal(calls[0].auth, 'Bearer sk-test')
})

test('submit:双路径 404 → AsyncImageUnsupportedError(触发同步回退)', async () => {
  const tried = []
  await assert.rejects(
    submitAsyncImageGeneration({
      baseUrl: 'https://gw.example/v1',
      apiKey: 'sk',
      body: '{}',
      fetchImpl: async (url) => {
        tried.push(url)
        return new Response('not found', { status: 404 })
      }
    }),
    AsyncImageUnsupportedError
  )
  assert.equal(tried.length, 2)
})

test('submit:5xx 报错并携带状态码(不吞错误信息)', async () => {
  await assert.rejects(
    submitAsyncImageGeneration({
      baseUrl: 'https://gw.example/v1',
      apiKey: 'sk',
      body: '{}',
      fetchImpl: async () => jsonResponse({ error: 'boom' }, { status: 503 })
    }),
    (error) => error.status === 503 && error.message === 'boom'
  )
})

// ==================== poll_url 归一化 / SSRF ====================

test('resolveAsyncPollUrl:相对路径拼网关 origin;跨源绝对地址拒绝', () => {
  assert.equal(
    resolveAsyncPollUrl('/v1/images/generations/async/t-1', 'https://gw.example'),
    'https://gw.example/v1/images/generations/async/t-1'
  )
  assert.equal(
    resolveAsyncPollUrl('https://gw.example/poll/t', 'https://gw.example'),
    'https://gw.example/poll/t'
  )
  assert.throws(() => resolveAsyncPollUrl('https://evil.example/poll', 'https://gw.example'), /跨源/)
})

// ==================== poll ====================

test('poll:processing→completed,取 result.data[].url 与 usage', async () => {
  let hits = 0
  const outcome = await pollAsyncImageResult({
    pollUrl: 'https://gw.example/poll/t',
    apiKey: 'sk',
    initialIntervalMs: 1,
    sleepImpl: noSleep,
    fetchImpl: async () => {
      hits++
      if (hits < 3) return jsonResponse({ status: 'processing' }, { headers: { 'Retry-After': '1' } })
      return jsonResponse({
        status: 'completed',
        image_url: 'https://s3.example/whole.png',
        result: { data: [{ url: 'https://s3.example/a.png', revised_prompt: 'rp' }], usage: { cost_in_usd_ticks: 2e9 } }
      })
    }
  })
  assert.equal(hits, 3)
  assert.deepEqual(outcome.data, [{ url: 'https://s3.example/a.png', revised_prompt: 'rp' }])
  assert.equal(outcome.usage.cost_in_usd_ticks, 2e9)
})

test('poll:completed 缺 result.data 时回退 image_url', async () => {
  const outcome = await pollAsyncImageResult({
    pollUrl: 'https://gw.example/poll/t',
    apiKey: 'sk',
    sleepImpl: noSleep,
    fetchImpl: async () => jsonResponse({ status: 'completed', image_url: 'https://s3.example/only.png' })
  })
  assert.equal(outcome.data[0].url, 'https://s3.example/only.png')
})

test('poll:failed 状态抛错并带 http_status', async () => {
  await assert.rejects(
    pollAsyncImageResult({
      pollUrl: 'https://gw.example/poll/t',
      apiKey: 'sk',
      sleepImpl: noSleep,
      fetchImpl: async () => jsonResponse({ status: 'failed', http_status: 422, error: '内容被拒' })
    }),
    (error) => error.message === '内容被拒' && error.status === 422
  )
})

test('poll:超过 maxWaitMs 抛超时', async () => {
  await assert.rejects(
    pollAsyncImageResult({
      pollUrl: 'https://gw.example/poll/t',
      apiKey: 'sk',
      maxWaitMs: -1,
      sleepImpl: noSleep,
      fetchImpl: async () => jsonResponse({ status: 'processing' })
    }),
    /超时/
  )
})

// ==================== 安全下载 ====================

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  Buffer.alloc(64, 7)
])
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

test('download:合法 PNG(octet-stream 头)按魔数放行', async () => {
  const result = await downloadImageAsBase64('https://s3.example/a', {
    lookupImpl: publicLookup,
    fetchImpl: async () => new Response(PNG, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
  })
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.bytes, PNG.byteLength)
  assert.equal(result.base64, PNG.toString('base64'))
})

test('download:魔数不匹配拒绝(即便 Content-Type 声称是图片)', async () => {
  await assert.rejects(
    downloadImageAsBase64('https://s3.example/fake', {
      lookupImpl: publicLookup,
      fetchImpl: async () => new Response('<html>oops</html>', { status: 200, headers: { 'Content-Type': 'image/png' } })
    }),
    /魔数/
  )
})

test('download:流式超限中断(Content-Length 缺失也拦得住)', async () => {
  const big = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024))
    }
  })
  await assert.rejects(
    downloadImageAsBase64('https://s3.example/big', {
      maxBytes: 3 * 1024 * 1024,
      lookupImpl: publicLookup,
      fetchImpl: async () => new Response(big, { status: 200, headers: { 'Content-Type': 'image/png' } })
    }),
    /大小上限/
  )
})

test('download:Content-Length 超限直接拒绝', async () => {
  await assert.rejects(
    downloadImageAsBase64('https://s3.example/huge', {
      maxBytes: 1024,
      lookupImpl: publicLookup,
      fetchImpl: async () => new Response(PNG, { status: 200, headers: { 'Content-Length': '999999999', 'Content-Type': 'image/png' } })
    }),
    /大小上限/
  )
})

test('download:非 https 拒绝', async () => {
  await assert.rejects(
    downloadImageAsBase64('http://s3.example/a', { lookupImpl: publicLookup, fetchImpl: async () => new Response(PNG) }),
    /https/
  )
})

test('download:域名解析到私网 IP 拒绝', async () => {
  await assert.rejects(
    downloadImageAsBase64('https://rebind.example/a', {
      lookupImpl: async () => [{ address: '10.0.0.8', family: 4 }],
      fetchImpl: async () => new Response(PNG)
    }),
    /私网/
  )
})

test('download:IPv6 私网判定按数值展开(十六进制/NAT64/6to4 写法均拦截)', () => {
  // 同一个 127.0.0.1 的各种 IPv6 写法——只认点分形式等于没防
  for (const address of [
    '::ffff:127.0.0.1',
    '::ffff:7f00:1', // 十六进制映射
    '::7f00:1', // IPv4 兼容(已废弃仍可路由)
    '64:ff9b::7f00:1', // NAT64
    '2002:7f00:1::1' // 6to4
  ]) {
    assert.equal(isPrivateAddress(address, 6), true, `应拒绝 ${address}`)
  }

  // 云元数据地址 169.254.169.254 的映射写法(SSRF 的头号目标)
  assert.equal(isPrivateAddress('::ffff:a9fe:a9fe', 6), true)
  assert.equal(isPrivateAddress('::ffff:169.254.169.254', 6), true)

  // 其余私有/特殊段
  assert.equal(isPrivateAddress('fe80::1%eth0', 6), true, 'zone id 不应绕过')
  assert.equal(isPrivateAddress('ff02::1', 6), true, '组播')
  assert.equal(isPrivateAddress('100::1', 6), true, '丢弃前缀')
  assert.equal(isPrivateAddress('not-an-address', 6), true, '解析失败一律拒绝')

  // 公网 IPv6 不能误伤
  assert.equal(isPrivateAddress('2001:4860:4860::8888', 6), false)
  assert.equal(isPrivateAddress('2606:4700:4700::1111', 6), false)
  assert.equal(isPrivateAddress('2002:5db8:d822::1', 6), false, '6to4 内嵌公网 IPv4 应放行')
})

test('download:字面私网 IP / IPv6 环回拒绝', async () => {
  assert.equal(isPrivateAddress('192.168.1.1', 4), true)
  assert.equal(isPrivateAddress('172.20.3.4', 4), true)
  assert.equal(isPrivateAddress('::1', 6), true)
  assert.equal(isPrivateAddress('::ffff:127.0.0.1', 6), true)
  assert.equal(isPrivateAddress('93.184.216.34', 4), false)
  await assert.rejects(
    downloadImageAsBase64('https://169.254.169.254/latest/meta-data', {
      lookupImpl: publicLookup,
      fetchImpl: async () => new Response(PNG)
    }),
    /私网/
  )
})

test('download:重定向逐跳复验,跳向私网被拒', async () => {
  const seen = []
  await assert.rejects(
    downloadImageAsBase64('https://s3.example/start', {
      lookupImpl: async (hostname) => {
        seen.push(hostname)
        return hostname === 'internal.example'
          ? [{ address: '127.0.0.1', family: 4 }]
          : [{ address: '93.184.216.34', family: 4 }]
      },
      fetchImpl: async (url) => {
        if (String(url).includes('/start')) {
          return new Response(null, { status: 302, headers: { Location: 'https://internal.example/steal' } })
        }
        return new Response(PNG, { status: 200 })
      }
    }),
    /私网/
  )
  assert.deepEqual(seen, ['s3.example', 'internal.example'])
})

test('download:正常重定向可跟随并成功', async () => {
  const result = await downloadImageAsBase64('https://s3.example/302', {
    lookupImpl: publicLookup,
    fetchImpl: async (url) => {
      if (String(url).includes('/302')) {
        return new Response(null, { status: 302, headers: { Location: 'https://cdn.example/real.png' } })
      }
      return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
    }
  })
  assert.equal(result.mimeType, 'image/png')
})

/** 提交阶段的「网关不支持」错误:必须带上 submit 标记才认。
 *  直接构造 Error 是拿不到标记的,这里复用真实提交路径产出带标记的错误。 */
async function submitStageError(status, body) {
  try {
    await submitAsyncImageGeneration({
      baseUrl: 'https://gw.test',
      apiKey: 'sk-test-key-000000000000000000',
      body: '{}',
      paths: ['/images/generations/async'],
      fetchImpl: async () => new Response(body, { status })
    })
  } catch (error) {
    return error
  }
  throw new Error('提交本应失败')
}

test('isGeminiAsyncFallbackError:提交阶段三类拒绝触发回退,业务错误不触发', async () => {
  assert.equal(isGeminiAsyncFallbackError(new AsyncImageUnsupportedError(405)), true)
  assert.equal(isGeminiAsyncFallbackError(await submitStageError(400, 'this model is not supported for this platform')), true)
  assert.equal(isGeminiAsyncFallbackError(await submitStageError(500, '404 page not found')), true)
  assert.equal(isGeminiAsyncFallbackError(await submitStageError(400, 'images endpoint requires an image model, got "gemini-3-pro-image"')), true)
  assert.equal(isGeminiAsyncFallbackError(await submitStageError(400, '内容未通过审核')), false)
  assert.equal(isGeminiAsyncFallbackError(new Error('insufficient balance')), false)
})

test('isGeminiAsyncFallbackError:轮询阶段错误一律不回退(防同一请求双扣费)', async () => {
  // 上游已受理并开始计费,此时任务过期/网关重启返 404——回落会再生成一张
  let pollError
  try {
    await pollAsyncImageResult({
      pollUrl: 'https://gw.test/v1/images/tasks/t1',
      apiKey: 'sk-test-key-000000000000000000',
      fetchImpl: async () => new Response('404 page not found', { status: 404 }),
      sleepImpl: async () => {}
    })
  } catch (error) {
    pollError = error
  }
  assert.equal(pollError.status, 404)
  assert.equal(isGeminiAsyncFallbackError(pollError), false, '轮询 404 绝不能触发 v1beta 重生成')

  // 轮询阶段哪怕带着与提交阶段同样的措辞,也不认
  const lookalike = Object.assign(new Error('this model is not supported for this platform'), { status: 400 })
  assert.equal(isGeminiAsyncFallbackError(lookalike), false)
})
