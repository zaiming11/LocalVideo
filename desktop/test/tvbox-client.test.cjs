const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('TVBox artwork snapshots reactive headers before crossing the Electron bridge', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../core/tvbox/client.js'), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export \{.*\}$/gm, '').replace(/^export /gm, '')
  const calls = []
  const sandbox = { window: { localVideoDesktop: { tvboxMediaUrl: (...args) => {
    calls.push(structuredClone(args)); return 'tvboxmedia://stream/test'
  } } } }
  vm.createContext(sandbox); vm.runInContext(source, sandbox)
  const headers = new Proxy({ Referer: 'https://example.com/', 'User-Agent': 'okhttp/3.12.13' }, {})
  assert.throws(() => structuredClone(headers), /cloned/)
  assert.equal(sandbox.tvboxMediaUrl('https://example.com/poster.jpg', headers, false), 'tvboxmedia://stream/test')
  assert.deepEqual(calls[0], ['https://example.com/poster.jpg', { Referer: 'https://example.com/', 'User-Agent': 'okhttp/3.12.13' }, false])
})
