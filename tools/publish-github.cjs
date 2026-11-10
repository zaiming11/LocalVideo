const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const tls = require('node:tls')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const apiBase = 'https://api.github.com/repos/zaiming11/LocalVideo'
const trustedCAs = tls.getCACertificates ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : undefined

async function sha256(file) {
  const hash = crypto.createHash('sha256')
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
function request(url, { method = 'GET', token, json, file } = {}) {
  const target = new URL(url)
  if (target.protocol !== 'https:' || !['api.github.com', 'uploads.github.com'].includes(target.hostname) || target.username || target.password) throw new Error('Invalid GitHub API URL')
  return new Promise((resolve, reject) => {
    const bytes = json === undefined ? null : Buffer.from(JSON.stringify(json))
    const headers = { 'User-Agent': 'LocalVideo-Publisher/1', Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' }
    if (bytes || file) { headers['Content-Type'] = file ? 'application/octet-stream' : 'application/json'; headers['Content-Length'] = file ? fs.statSync(file).size : bytes.length }
    const req = https.request(target, { method, headers, ...(trustedCAs ? { ca: trustedCAs } : {}) }, response => {
      const chunks = []; let size = 0
      response.on('data', bytes => { size += bytes.length; if (size > 4 * 1024 ** 2) response.destroy(new Error('GitHub response too large')); else chunks.push(bytes) })
      response.on('error', reject)
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('GitHub HTTP ' + response.statusCode + ': ' + text.slice(0, 500)))
        try { resolve(text ? JSON.parse(text) : null) } catch { reject(new Error('Invalid GitHub response')) }
      })
    })
    req.setTimeout(60000, () => req.destroy(new Error('GitHub request timed out; retry to resume verified assets')))
    req.on('error', reject)
    if (file) {
      const input = fs.createReadStream(file); let sent = 0, last = 0
      input.on('data', chunk => { sent += chunk.length; if (sent - last >= 32 * 1024 ** 2) { console.log(path.basename(file) + ': ' + Math.floor(sent / 1024 ** 2) + ' MiB sent'); last = sent } })
      input.on('error', error => req.destroy(error)); req.on('close', () => input.destroy()); input.pipe(req)
    }
    else req.end(bytes)
  })
}
function credential() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const result = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true, timeout: 30000 })
  const password = result.stdout?.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9)
  if (result.status !== 0 || !password) throw new Error('GitHub authentication unavailable; sign in to Git or set GH_TOKEN')
  return password
}
async function main() {
  const manifestFile = path.resolve(option('--manifest', path.join(root, 'updates/version.json')))
  const directory = path.resolve(option('--directory', path.join(root, 'desktop/.update-publish')))
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const { readRelease } = await import(pathToFileURL(path.join(root, 'core/update/model.mjs')).href)
  const packages = []; let tag
  for (const platform of ['windows', 'android']) {
    const release = readRelease(manifest, platform, '0.0.0')
    if (!release) continue
    if (!release.downloadUrl || release.chunks) throw new Error('Regenerate the GitHub manifest: full packages and pinned downloadUrl are required')
    const releaseTag = new URL(release.downloadUrl).pathname.split('/')[5]
    if (tag && tag !== releaseTag) throw new Error('All packages must belong to the same GitHub Release')
    tag = releaseTag
    const file = path.join(directory, release.file)
    if (fs.statSync(file).size !== release.size || await sha256(file) !== release.sha256) throw new Error('Package integrity mismatch: ' + release.file)
    packages.push({ file, name: release.file, size: release.size, digest: 'sha256:' + release.sha256 })
  }
  if (!packages.length) throw new Error('No platform packages found')
  packages.push({ file: manifestFile, name: 'version.json', size: fs.statSync(manifestFile).size, digest: 'sha256:' + await sha256(manifestFile) })
  const checksumFile = path.join(directory, 'SHA256SUMS.txt')
  fs.writeFileSync(checksumFile, packages.map(asset => asset.digest.slice(7) + '  ' + asset.name).join('\n') + '\n')
  packages.push({ file: checksumFile, name: 'SHA256SUMS.txt', size: fs.statSync(checksumFile).size, digest: 'sha256:' + await sha256(checksumFile) })
  console.log('Verified release ' + tag + ': ' + packages.map(p => p.name).join(', '))
  if (!args.includes('--publish')) { console.log('Dry run only. Add --publish to upload and publish this release.'); return }
  const token = credential(), api = (url, options = {}) => request(url, { token, ...options })
  // Paginate so a retry can find its draft even after many published releases.
  let release
  for (let page = 1; ; page++) {
    const batch = await api(apiBase + '/releases?per_page=100&page=' + page)
    release = batch.find(item => item.tag_name === tag)
    if (release || batch.length < 100) break
  }
  if (release && !release.draft) throw new Error('This tag is already published; prepare a new tag instead of replacing a live release')
  if (!release) {
    const notesFile = option('--notes-file')
    const body = notesFile ? fs.readFileSync(path.resolve(notesFile), 'utf8') : '应用更新：' + packages.filter(p => p.name !== 'version.json').map(p => p.name).join('、')
    release = await api(apiBase + '/releases', { method: 'POST', json: { tag_name: tag, target_commitish: option('--target', 'main'), name: '本地影库 ' + tag, body, draft: true, prerelease: false } })
  }
  for (const asset of packages) {
    const assets = await api(apiBase + '/releases/' + release.id + '/assets?per_page=100')
    const old = assets.find(item => item.name === asset.name)
    if (old?.state === 'uploaded' && old.size === asset.size && old.digest === asset.digest) { console.log('Verified uploaded ' + asset.name); continue }
    if (old) await api(apiBase + '/releases/assets/' + old.id, { method: 'DELETE' })
    console.log('Uploading ' + asset.name)
    const uploaded = await api(release.upload_url.split('{')[0] + '?name=' + encodeURIComponent(asset.name), { method: 'POST', file: asset.file })
    if (uploaded.state !== 'uploaded' || uploaded.size !== asset.size || uploaded.digest !== asset.digest) throw new Error('Uploaded asset failed integrity verification: ' + asset.name)
  }
  if (args.includes('--draft')) { console.log('Draft uploads verified: ' + release.html_url); return }
  const published = await api(apiBase + '/releases/' + release.id, { method: 'PATCH', json: { draft: false, make_latest: 'true' } })
  console.log('Published ' + published.html_url)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
