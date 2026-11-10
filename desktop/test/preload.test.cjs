const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('sandbox preload encodes TVBox artwork and video URLs without a global Buffer', () => {
  let api
  const sandbox = { TextEncoder, btoa, require: name => {
    assert.equal(name, 'electron')
    return { contextBridge: { exposeInMainWorld: (_name, value) => { api = value } }, ipcRenderer: {}, webUtils: {} }
  } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8'), sandbox)
  for (const url of ['https://example.com/海报.jpg?q=1+2', 'https://example.com/video.m3u8']) {
    const headers = { Referer: 'https://example.com/', 'User-Agent': '测试' }
    const encoded = api.tvboxMediaUrl(url, headers, true)
    assert.match(encoded, /^tvboxmedia:\/\/stream\/[A-Za-z0-9_-]+$/)
    assert.deepEqual(JSON.parse(Buffer.from(new URL(encoded).pathname.slice(1), 'base64url').toString('utf8')), { url, headers, allowLocal: true })
  }
  const defaultUrl = api.tvboxMediaUrl('https://example.com/poster.jpg')
  assert.equal(JSON.parse(Buffer.from(new URL(defaultUrl).pathname.slice(1), 'base64url').toString()).allowLocal, false)
})
