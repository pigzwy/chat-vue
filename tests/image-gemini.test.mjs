// Gemini(Nano Banana)生图上游单测:node --experimental-strip-types --test tests/image-gemini.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'

const { buildGeminiImageBody, callGeminiImageGeneration, extractGeminiImages } =
  await import('../server/utils/imageGeminiUpstream.ts')

test('buildGeminiImageBody:prompt + imageSize + aspectRatio + 参考图', () => {
  const body = JSON.parse(buildGeminiImageBody({
    prompt: '一只小猪',
    imageSize: '2K',
    aspectRatio: '16:9',
    referenceImages: [{ mimeType: 'image/png', data: 'QUJD' }]
  }))
  assert.deepEqual(body.contents[0].parts[0], { text: '一只小猪' })
  assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: 'QUJD' } })
  assert.deepEqual(body.generationConfig.imageConfig, { imageSize: '2K', aspectRatio: '16:9' })
  assert.deepEqual(body.generationConfig.responseModalities, ['TEXT', 'IMAGE'])
})

test('buildGeminiImageBody:无比例时不带 aspectRatio 字段', () => {
  const body = JSON.parse(buildGeminiImageBody({ prompt: 'p', imageSize: '1K' }))
  assert.deepEqual(body.generationConfig.imageConfig, { imageSize: '1K' })
})

test('extractGeminiImages:兼容 inlineData 与 inline_data,跳过纯文本 part', () => {
  const images = extractGeminiImages({
    candidates: [{
      content: {
        parts: [
          { text: 'here is your image' },
          { inlineData: { mimeType: 'image/png', data: 'AAA' } },
          { inline_data: { mime_type: 'image/jpeg', data: 'BBB' } }
        ]
      }
    }]
  })
  assert.deepEqual(images, [
    { b64: 'AAA', mimeType: 'image/png' },
    { b64: 'BBB', mimeType: 'image/jpeg' }
  ])
})

test('call:成功路径,URL/头/模型编码正确', async () => {
  let seen
  const images = await callGeminiImageGeneration({
    rootUrl: 'https://gw.example/',
    apiKey: 'sk-test',
    model: 'gemini-3.1-flash-image',
    body: '{"x":1}',
    fetchImpl: async (url, init) => {
      seen = { url: String(url), auth: init.headers.Authorization }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'IMG' } }] } }]
      }), { status: 200 })
    }
  })
  assert.equal(seen.url, 'https://gw.example/v1beta/models/gemini-3.1-flash-image:generateContent')
  assert.equal(seen.auth, 'Bearer sk-test')
  assert.equal(images[0].b64, 'IMG')
})

test('call:Google 错误结构透传 message 与状态码', async () => {
  await assert.rejects(
    callGeminiImageGeneration({
      rootUrl: 'https://gw.example',
      apiKey: 'sk',
      model: 'm',
      body: '{}',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 })
    }),
    (error) => error.message === 'quota exceeded' && error.status === 429
  )
})

test('call:200 但无图 → 明确报错;安全拦截给出 blockReason', async () => {
  await assert.rejects(
    callGeminiImageGeneration({
      rootUrl: 'https://gw.example', apiKey: 'sk', model: 'm', body: '{}',
      fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }), { status: 200 })
    }),
    /未返回图片/
  )
  await assert.rejects(
    callGeminiImageGeneration({
      rootUrl: 'https://gw.example', apiKey: 'sk', model: 'm', body: '{}',
      fetchImpl: async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })
    }),
    /SAFETY/
  )
})
