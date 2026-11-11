import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/tvbox.mjs'
import network from '../desktop/tvbox-network.cjs'

const request = (path, body, headers = {}) => new Request('https://cinema.netlify.app' + path, { method: 'POST', body: JSON.stringify(body), headers })

test('cloud configuration requests retain remote headers and never enable loopback', async () => {
  const original = network.requestText
  try {
    network.requestText = async (url, headers, allowLocal) => {
      assert.equal(url, 'https://public.example/config.json')
      assert.equal(headers.Referer, 'https://public.example/')
      assert.equal(allowLocal, false)
      return { url, body: '{"sites":[]}' }
    }
    for (const path of ['/__tvbox/request', '/.netlify/functions/tvbox/request']) {
      const response = await handler(request(path, { url: 'https://public.example/config.json', headers: { Referer: 'https://public.example/' }, allowLocal: true }))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).body, '{"sites":[]}')
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  } finally { network.requestText = original }
})

test('cloud adapter rejects cross-site, malformed, oversized and unsupported requests', async () => {
  assert.equal((await handler(request('/__tvbox/request', {}, { Origin: 'https://other.example' }))).status, 403)
  assert.equal((await handler(request('/__tvbox/request', {}, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403)
  assert.equal((await handler(new Request('https://cinema.netlify.app/__tvbox/request'))).status, 405)
  assert.equal((await handler(new Request('https://cinema.netlify.app/__tvbox/request', { method: 'POST', body: '{' }))).status, 400)
  assert.equal((await handler(request('/__tvbox/request', { url: '' }))).status, 400)
  assert.equal((await handler(request('/__tvbox/request', { url: 'x'.repeat(65000) }))).status, 413)
  assert.equal((await handler(new Request('https://cinema.netlify.app/__tvbox/unknown'))).status, 404)
})

test('public cloud requests cannot access private or loopback resources', async () => {
  for (const url of ['http://127.0.0.1:1234/', 'http://192.168.1.1/']) {
    assert.equal((await handler(request('/__tvbox/request', { url, allowLocal: true }))).status, 502)
  }
  const media = network.mediaUrl('http://127.0.0.1/video.mp4', {}, true, 'https://cinema.netlify.app/__tvbox/media/')
  assert.equal((await handler(new Request(media))).status, 400)
})

test('media responses stream with original Range and HEAD semantics and public playlist prefix', async () => {
  const original = network.mediaResponse
  try {
    network.mediaResponse = async (input, prefix) => {
      assert.equal(prefix, 'https://cinema.netlify.app/__tvbox/media/')
      assert.equal(input.headers.get('range'), 'bytes=2-4')
      return new Response(input.method === 'HEAD' ? null : new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([2, 3, 4])); controller.close() } }), {
        status: 206, headers: { 'Content-Range': 'bytes 2-4/10', 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*' }
      })
    }
    const url = network.mediaUrl('https://public.example/video.mp4', {}, false, 'https://cinema.netlify.app/__tvbox/media/')
    const response = await handler(new Request(url, { headers: { Range: 'bytes=2-4' } }))
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-range'), 'bytes 2-4/10')
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2, 3, 4])
    const head = await handler(new Request(url, { method: 'HEAD', headers: { Range: 'bytes=2-4' } }))
    assert.equal(head.status, 206); assert.equal(await head.text(), '')
  } finally { network.mediaResponse = original }
})
