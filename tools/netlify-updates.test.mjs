import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { readRelease, NETLIFY_UPDATE_ROOT } from '../core/update/model.mjs'
const { prepareNetlifyUpdates } = createRequire(import.meta.url)('./prepare-netlify-updates.cjs')

test('Netlify staging retains package identities, produces reassemblable Windows parts and refuses corrupt source packages', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-netlify-updates-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  const directory = path.join(work, 'source'), output = path.join(work, 'stage'), publishDir = path.join(work, 'public')
  fs.mkdirSync(directory)
  const windows = Buffer.alloc(32 * 1024 * 1024 + 17, 42), android = Buffer.from('signed-apk-test-fixture')
  const release = (bytes, file) => ({ version: '1.2.0', file, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  const original = { schemaVersion: 1, platforms: { windows: release(windows, 'LocalVideo-1.2.0-Setup.exe'), android: { ...release(android, 'LocalVideo-1.2.0.apk'), versionCode: 120 } } }
  for (const [platform, bytes] of [['windows', windows], ['android', android]]) fs.writeFileSync(path.join(directory, original.platforms[platform].file), bytes)
  const manifest = path.join(work, 'version.json'); fs.writeFileSync(manifest, JSON.stringify(original))
  const result = await prepareNetlifyUpdates({ manifest, directory, output, publishDir })
  assert.equal(result.manifest.platforms.windows.chunks.length, 2)
  assert.equal(result.manifest.platforms.windows.downloadUrl, undefined)
  assert.equal(result.manifest.platforms.android.downloadUrl, NETLIFY_UPDATE_ROOT + original.platforms.android.file)
  const assembled = Buffer.concat(result.manifest.platforms.windows.chunks.map(part => {
    const bytes = fs.readFileSync(path.join(publishDir, 'updates', part.file))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), part.sha256)
    return bytes
  }))
  assert.equal(crypto.createHash('sha256').update(assembled).digest('hex'), original.platforms.windows.sha256)
  assert.equal(readRelease(result.manifest, 'windows', '1.0.0').size, windows.length)
  assert.deepEqual(fs.readFileSync(path.join(publishDir, 'updates', original.platforms.android.file)), android)
  const published = fs.readFileSync(path.join(publishDir, 'updates/version.json'), 'utf8')
  fs.appendFileSync(path.join(directory, original.platforms.android.file), 'corrupt')
  await assert.rejects(prepareNetlifyUpdates({ manifest, directory, output, publishDir }), /校验失败/)
  assert.equal(fs.readFileSync(path.join(publishDir, 'updates/version.json'), 'utf8'), published)
})
