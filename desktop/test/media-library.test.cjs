const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { MediaLibrary, fileResponse } = require('../media-library.cjs')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-desktop-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const media = path.join(root, '剧集')
  fs.mkdirSync(path.join(media, '第二季'), { recursive: true })
  for (const name of ['第1集.mp4', '第10集.mp4', '第2集.mp4', '第二季/第1集.mkv']) fs.writeFileSync(path.join(media, name), '0123456789')
  fs.writeFileSync(path.join(media, '笔记.txt'), 'not video')
  const registry = path.join(root, 'data/media.json')
  return { root, media, registry, library: new MediaLibrary(registry) }
}

test('native folder import finds nested videos, sorts numbers and survives restart', async (t) => {
  const { media, registry, library } = fixture(t)
  const entries = await library.addPaths([media])
  assert.equal(entries.length, 4)
  assert.deepEqual(entries.filter(e => e.file.name.endsWith('.mp4')).map(e => e.file.name), ['第1集.mp4', '第2集.mp4', '第10集.mp4'])
  assert(entries.some(e => e.folder.endsWith('/第二季')))
  const restored = new MediaLibrary(registry)
  for (const entry of entries) assert(fs.existsSync(restored.resolve(entry.file.desktopUrl)))
  const again = await restored.addPaths([media])
  assert.deepEqual(again.map(e => e.file.desktopId), entries.map(e => e.file.desktopId))
  assert.equal(restored.resolve('localmedia://library/../../private.txt'), null)
  assert.equal(restored.resolve(entries[0].file.desktopUrl.replace('library', 'other')), null)
})

test('file protocol supports full loads, HEAD, seeks, suffix ranges and missing files', async (t) => {
  const { media } = fixture(t)
  const file = path.join(media, '第1集.mp4')
  const request = (range, method = 'GET') => new Request('localmedia://library/test', { method, headers: range ? { range } : {} })
  const full = await fileResponse(request(), file, 'video/mp4')
  assert.equal(await full.text(), '0123456789')
  const head = await fileResponse(request(null, 'HEAD'), file, 'video/mp4')
  assert.equal(head.headers.get('content-length'), '10')
  assert.equal(await head.text(), '')
  for (const [range, body] of [['bytes=2-5', '2345'], ['bytes=7-', '789'], ['bytes=-2', '89']]) {
    const response = await fileResponse(request(range), file, 'video/mp4')
    assert.equal(response.status, 206)
    assert.equal(await response.text(), body)
  }
  assert.equal((await fileResponse(request('bytes=10-'), file, 'video/mp4')).status, 416)
  assert.equal((await fileResponse(request(), file + '.missing', 'video/mp4')).status, 404)
})
