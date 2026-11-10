import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
test('GitHub release preparation pins complete packages and publisher rejects corrupted files before upload', t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-publish-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  const windows = path.join(work, 'source.exe'), android = path.join(work, 'source.apk'), directory = path.join(work, 'stage'), manifest = path.join(work, 'updates/version.json')
  fs.writeFileSync(windows, 'installer fixture'); fs.writeFileSync(android, 'apk fixture')
  const run = (script, args) => spawnSync(process.execPath, [path.join(root, script), ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  const prepared = run('tools/prepare-updates.cjs', [windows, android, '--tag', 'v2.0.0', '--output-dir', directory, '--manifest', manifest])
  assert.equal(prepared.status, 0, prepared.stderr)
  const data = JSON.parse(fs.readFileSync(manifest))
  for (const entry of Object.values(data.platforms)) {
    assert.equal(entry.downloadUrl, 'https://github.com/zaiming11/LocalVideo/releases/download/v2.0.0/' + entry.file)
    assert.equal(entry.chunks, undefined)
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'version.json'))), data)
  const checked = run('tools/publish-github.cjs', ['--manifest', manifest, '--directory', directory])
  assert.equal(checked.status, 0, checked.stderr); assert.match(checked.stdout, /Dry run only/)
  fs.appendFileSync(path.join(directory, data.platforms.android.file), 'corrupted')
  const corrupt = run('tools/publish-github.cjs', ['--manifest', manifest, '--directory', directory])
  assert.notEqual(corrupt.status, 0); assert.match(corrupt.stderr, /integrity mismatch/)
})
