import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { compareVersions, readRelease, githubDownloadUrl, updateSources, updateNetworkConfig, DEFAULT_UPDATE_URL } from '../core/update/model.mjs'

test('update versions compare numeric segments and prereleases correctly', () => {
  assert(compareVersions('1.10.0', '1.2.0') > 0)
  assert(compareVersions('1.1.0-alpha.10', '1.1.0-alpha.2') > 0)
  assert(compareVersions('1.1.0', '1.1.0-alpha.10') > 0)
  assert.equal(compareVersions('1.2.3+build2', '1.2.3'), 0)
  assert(compareVersions('1.0.0', '1.1.0') < 0)
  assert.throws(() => compareVersions('invalid', '1.0.0'))
})
test('manifest validation rejects wrong platform packages, traversal and incomplete integrity metadata', () => {
  const release = { version: '1.2.0', file: 'LocalVideo-1.2.0-Setup.exe', size: 123, sha256: 'a'.repeat(64) }
  const manifest = { schemaVersion: 1, platforms: { windows: release } }
  assert.equal(readRelease(manifest, 'windows', '1.1.0').available, true)
  assert.equal(readRelease(manifest, 'windows', '1.2.0').available, false)
  assert.equal(readRelease(manifest, 'android', '1.0.0'), null)
  for (const file of ['../evil.exe', 'https://evil.example/x.exe', 'x.apk', '%2e%2e.exe']) assert.throws(() => readRelease({ ...manifest, platforms: { windows: { ...release, file } } }, 'windows', '1.0.0'))
  assert.throws(() => readRelease({ ...manifest, platforms: { windows: { ...release, sha256: '' } } }, 'windows', '1.0.0'))
  assert.throws(() => readRelease({ schemaVersion: 1, platforms: { android: { ...release, file: 'app.apk' } } }, 'android', '1.0.0'))
  assert.throws(() => readRelease({ ...manifest, platforms: { windows: { ...release, chunks: [{ file: 'app.exe.part001', size: 1, sha256: 'a'.repeat(64) }] } } }, 'windows', '1.0.0'), /总大小/)
})

test('GitHub downloads stay pinned to this repository and reject wrong hosts, repos or filenames', () => {
  const file = 'LocalVideo-1.2.0-Setup.exe'
  const url = 'https://github.com/zaiming11/LocalVideo/releases/download/v1.2.0/' + file
  const manifest = { schemaVersion: 1, platforms: { windows: { version: '1.2.0', file, size: 10, sha256: 'a'.repeat(64), downloadUrl: url } } }
  assert.equal(readRelease(manifest, 'windows', '1.1.0').downloadUrl, url)
  for (const invalid of [url.replace('https:', 'http:'), url.replace('github.com', 'evil.example'), url.replace('/LocalVideo/', '/OtherRepo/'), url.replace(file, 'different.exe'), url + '?token=secret', url + '#fragment', url.replace('github.com', 'user:password@github.com'), url.replace('/v1.2.0/', '/latest/download/')]) assert.throws(() => githubDownloadUrl(invalid, file))
})

test('update routing supports automatic, direct and custom HTTPS mirrors without changing canonical asset URLs', () => {
  assert.deepEqual(updateSources(DEFAULT_UPDATE_URL), ['https://gh-proxy.com/' + DEFAULT_UPDATE_URL, DEFAULT_UPDATE_URL])
  assert.deepEqual(updateSources(DEFAULT_UPDATE_URL, { downloadMode: 'direct' }), [DEFAULT_UPDATE_URL])
  assert.deepEqual(updateSources(DEFAULT_UPDATE_URL, { downloadMode: 'custom', mirrorUrl: 'https://mirror.example/gh' }), ['https://mirror.example/gh/' + DEFAULT_UPDATE_URL, DEFAULT_UPDATE_URL])
  for (const mirrorUrl of ['', 'http://mirror.example/', 'https://user:pass@mirror.example/', 'https://mirror.example/?token=a', 'https://mirror.example/#hash']) assert.throws(() => updateNetworkConfig({ downloadMode: 'custom', mirrorUrl }))
})

test('Android release validation works in a runtime without a global URL constructor', () => {
  const model = new URL('../core/update/model.mjs', import.meta.url).href
  const vendor = new URL('../core/tvbox/vendor.mjs', import.meta.url).href
  const code = `
    import assert from 'node:assert/strict';
    globalThis.URL = undefined;
    const { readRelease } = await import(${JSON.stringify(model)});
    const { UniversalURL } = await import(${JSON.stringify(vendor)});
    const file = 'LocalVideo-1.0.6-Android.apk';
    const downloadUrl = 'https://github.com/zaiming11/LocalVideo/releases/download/v1.0.6/' + file;
    const manifest = { schemaVersion: 1, platforms: { android: { version: '1.0.6', versionCode: 106, file, downloadUrl, size: 100, sha256: 'a'.repeat(64) } } };
    const release = readRelease(manifest, 'android', '1.0.5', UniversalURL);
    assert.equal(release.available, true); assert.equal(release.downloadUrl, downloadUrl);
    manifest.platforms.android.downloadUrl = downloadUrl.replace('github.com', 'evil.example');
    assert.throws(() => readRelease(manifest, 'android', '1.0.5', UniversalURL));
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000, windowsHide: true })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
})
