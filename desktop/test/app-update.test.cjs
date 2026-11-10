const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { AppUpdate, normalizeConfig, DEFAULT_URL } = require('../app-update.cjs')
const secure = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }
function setup(t, corrupt = false) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-update-')); t.after(() => fs.rmSync(userData, { recursive: true, force: true }))
  const bytes = Buffer.from('installer fixture'), release = { version: '1.2.0', file: 'app-1.2.0.exe', downloadUrl: 'https://github.com/zaiming11/LocalVideo/releases/download/v1.2.0/app-1.2.0.exe', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
  const manifest = { schemaVersion: 1, platforms: { windows: release } }, opened = [], requests = []
  const updater = new AppUpdate({ userData, version: '1.1.0', secureStorage: secure, openInstaller: async file => { opened.push(file); return '' }, request: async (url, config) => { requests.push({ url, config }); return Readable.from([url.endsWith('version.json') ? Buffer.from(JSON.stringify(manifest)) : corrupt ? Buffer.alloc(bytes.length, 0) : bytes]) } })
  return { updater, release, opened, bytes, userData, requests }
}
test('fresh installs check GitHub without setup and download from a pinned release', async t => {
  const { updater, requests, release } = setup(t)
  assert.equal(updater.publicConfig().configured, true)
  assert.equal(updater.publicConfig().autoCheck, true)
  assert.equal((await updater.check()).release.available, true)
  await updater.download()
  assert.equal(requests[0].url, 'https://gh-proxy.com/' + DEFAULT_URL)
  assert.equal(requests[1].url, 'https://gh-proxy.com/' + release.downloadUrl)
  assert.equal(requests[1].config.password, undefined)
})

test('only a checked and fully verified package can launch an installer; post-download tampering is rejected', async t => {
  const { updater, opened, userData, release, bytes } = setup(t)
  await assert.rejects(() => updater.install(), /先下载/)
  assert.equal((await updater.check()).release.available, true)
  await updater.download(); const file = path.join(userData, 'updates', release.file)
  fs.writeFileSync(file, 'tampered'); await assert.rejects(() => updater.install(), /校验失败/); assert.equal(opened.length, 0)
  fs.writeFileSync(file, bytes); await updater.install(); assert.deepEqual(opened, [file])
})

test('legacy settings migrate to GitHub, preserve auto-check and discard credentials', t => {
  const { updater, userData } = setup(t)
  const legacy = path.join(userData, 'update-source.encrypted')
  fs.writeFileSync(legacy, JSON.stringify({ manifestUrl: 'https://dav.jianguoyun.com/dav/old/version.json', username: 'fixture', password: 'fixture-only', autoCheck: false }))
  assert.deepEqual(updater.publicConfig(), { manifestUrl: DEFAULT_URL, autoCheck: false, downloadMode: 'auto', mirrorUrl: '', configured: true, currentVersion: '1.1.0' })
  assert.equal(fs.existsSync(legacy), false)
  assert.equal(fs.readFileSync(updater.configFile, 'utf8').includes('fixture'), false)
  const restarted = new AppUpdate({ userData, version: '1.1.0', openInstaller: async () => '' })
  assert.equal(restarted.publicConfig().autoCheck, false)
  assert.deepEqual(normalizeConfig({ manifestUrl: 'https://other.example/version.json', username: 'a', password: 'b' }), { manifestUrl: DEFAULT_URL, autoCheck: true, downloadMode: 'auto', mirrorUrl: '' })
  restarted.saveConfig({ autoCheck: true, password: 'ignored' })
  assert.deepEqual(restarted.loadConfig(), { manifestUrl: DEFAULT_URL, autoCheck: true, downloadMode: 'auto', mirrorUrl: '' })
})

test('corrupt packages never become installable or leave a completed cached package', async t => {
  const { updater, userData, release, opened } = setup(t, true)
  await updater.check(); await assert.rejects(() => updater.download(), /校验失败/)
  assert.equal(fs.existsSync(path.join(userData, 'updates', release.file)), false)
  await assert.rejects(() => updater.install(), /先下载/); assert.equal(opened.length, 0)
})
test('chunked installers are assembled in manifest order and verified as a complete installer', async t => {
  const { updater, userData, release, bytes } = setup(t)
  const chunks = [bytes.subarray(0, 5), bytes.subarray(5)]
  release.chunks = chunks.map((chunk, i) => ({ file: `app.exe.part00${i + 1}`, size: chunk.length, sha256: crypto.createHash('sha256').update(chunk).digest('hex') }))
  updater.request = async url => Readable.from([url.endsWith('version.json') ? Buffer.from(JSON.stringify({ schemaVersion: 1, platforms: { windows: release } })) : chunks[url.endsWith('001') ? 0 : 1]])
  await updater.check(); await updater.download()
  assert.deepEqual(fs.readFileSync(path.join(userData, 'updates', release.file)), bytes)
  release.chunks[1].sha256 = '0'.repeat(64)
  await updater.check(); await assert.rejects(() => updater.download(), /分片校验失败/)
  await assert.rejects(() => updater.install(), /先下载/)
})

test('failed and superseded checks invalidate previously downloaded releases', async t => {
  const { updater } = setup(t)
  await updater.check(); await updater.download()
  updater.request = async () => { throw new Error('offline') }
  await assert.rejects(() => updater.check(), /offline/)
  await assert.rejects(() => updater.install(), /先下载/)
  let finish
  updater.request = () => new Promise(resolve => { finish = resolve })
  const pending = updater.check()
  await new Promise(resolve => setImmediate(resolve))
  updater.saveConfig({ autoCheck: false })
  finish(Readable.from([Buffer.from(JSON.stringify({ schemaVersion: 1, platforms: {} }))]))
  await assert.rejects(() => pending, /已改变/)
  assert.equal(updater.release, null)
})

test('same or newer installed versions do not offer old GitHub installers', async t => {
  const { updater, release } = setup(t)
  release.version = '1.0.0'
  assert.equal((await updater.check()).release.available, false)
  await assert.rejects(() => updater.download(), /先检查/)
})

test('bad mirror manifests and corrupt mirror installers fall back to verified GitHub originals', async t => {
  const { updater, release, bytes } = setup(t)
  const requests = []
  updater.request = async url => {
    requests.push(url)
    const mirror = url.startsWith('https://gh-proxy.com/')
    return Readable.from([url.endsWith('version.json') ? Buffer.from(mirror ? '<html>blocked</html>' : JSON.stringify({ schemaVersion: 1, platforms: { windows: release } })) : mirror ? Buffer.alloc(bytes.length, 0) : bytes])
  }
  await updater.check(); await updater.download()
  assert.deepEqual(requests, ['https://gh-proxy.com/' + DEFAULT_URL, DEFAULT_URL, 'https://gh-proxy.com/' + release.downloadUrl, release.downloadUrl])
  assert.equal(updater.downloaded.release.version, release.version)
})

test('custom mirrors are saved and direct mode does not contact any mirror', async t => {
  const { updater, requests, release } = setup(t)
  updater.saveConfig({ downloadMode: 'custom', mirrorUrl: 'https://mirror.example/proxy' })
  await updater.check(); await updater.download()
  assert.equal(requests[0].url, 'https://mirror.example/proxy/' + DEFAULT_URL)
  requests.length = 0; updater.saveConfig({ downloadMode: 'direct' })
  await updater.check(); await updater.download()
  assert.deepEqual(requests.map(r => r.url), [DEFAULT_URL, release.downloadUrl])
  assert.throws(() => updater.saveConfig({ downloadMode: 'custom', mirrorUrl: 'http://mirror.example' }), /HTTPS/)
})
