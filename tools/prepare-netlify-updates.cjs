const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
const CHUNK = 32 * 1024 * 1024
function digest(file) { return new Promise((resolve, reject) => { const hash = crypto.createHash('sha256'), stream = fs.createReadStream(file); stream.on('data', bytes => hash.update(bytes)); stream.on('end', () => resolve(hash.digest('hex'))); stream.on('error', reject) }) }
async function prepareNetlifyUpdates(options = {}) {
  const manifestFile = path.resolve(options.manifest || path.join(root, 'updates/version.json'))
  const source = path.resolve(options.directory || path.join(root, 'desktop/.update-publish'))
  const output = path.resolve(options.output || path.join(root, 'desktop/.netlify-updates'))
  const { readRelease, NETLIFY_UPDATE_ROOT } = await import(pathToFileURL(path.join(root, 'core/update/model.mjs')).href)
  const original = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const manifest = { ...original, platforms: {} }, files = []
  const previousFile = path.join(output, 'version.json'), retained = []
  if (fs.existsSync(previousFile)) {
    const previous = JSON.parse(fs.readFileSync(previousFile, 'utf8'))
    for (const platform of ['windows', 'android']) {
      const release = readRelease(previous, platform, '0.0.0')
      if (!release) continue
      for (const asset of release.chunks || [release]) {
        const file = path.join(output, asset.file)
        if (!fs.existsSync(file) || fs.statSync(file).size !== asset.size || await digest(file) !== asset.sha256) throw new Error('上一批 Netlify 安装包缓存校验失败：' + asset.file)
        retained.push(asset.file)
      }
    }
  }
  for (const platform of ['windows', 'android']) {
    const release = readRelease(original, platform, '0.0.0')
    if (!release) continue
    const file = path.join(source, release.file)
    if (!fs.existsSync(file) || fs.statSync(file).size !== release.size || await digest(file) !== release.sha256) throw new Error('已发布安装包缺失或校验失败：' + release.file)
  }
  fs.mkdirSync(output, { recursive: true })
  for (const platform of ['windows', 'android']) {
    const release = original.platforms[platform]
    if (!release) continue
    const next = { ...release, downloadUrl: NETLIFY_UPDATE_ROOT + release.file }
    if (next.notes) next.notes = next.notes.replace('Netlify 尚未配置', 'Netlify 安装包下载渠道已配置')
    delete next.chunks
    const file = path.join(source, release.file)
    if (platform === 'windows' && release.size > CHUNK) {
      delete next.downloadUrl; next.chunks = []
      const fd = fs.openSync(file, 'r'), fullHash = crypto.createHash('sha256')
      try {
        for (let offset = 0, index = 1; offset < release.size; offset += CHUNK, index++) {
          const bytes = Buffer.alloc(Math.min(CHUNK, release.size - offset))
          for (let filled = 0; filled < bytes.length;) { const count = fs.readSync(fd, bytes, filled, bytes.length - filled, offset + filled); if (!count) throw new Error('安装包读取不完整'); filled += count }
          const name = release.file + '.part' + String(index).padStart(3, '0')
          fs.writeFileSync(path.join(output, name), bytes); fullHash.update(bytes)
          next.chunks.push({ file: name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }); files.push(name)
        }
      } finally { fs.closeSync(fd) }
      if (fullHash.digest('hex') !== release.sha256) throw new Error('分片期间安装包发生改变')
    } else {
      fs.copyFileSync(file, path.join(output, release.file))
      if (await digest(path.join(output, release.file)) !== release.sha256) throw new Error('安装包复制校验失败')
      files.push(release.file)
    }
    manifest.platforms[platform] = next
  }
  for (const platform of ['windows', 'android']) readRelease(manifest, platform, '0.0.0')
  const json = JSON.stringify(manifest, null, 2) + '\n'
  fs.writeFileSync(path.join(output, 'version.json'), json)
  if (!options.output) fs.writeFileSync(path.join(root, 'updates/netlify-version.json'), json)
  if (options.publishDir) {
    const target = path.resolve(options.publishDir, 'updates')
    fs.mkdirSync(target, { recursive: true })
    for (const name of new Set([...retained, ...files, 'version.json'])) fs.copyFileSync(path.join(output, name), path.join(target, name))
  }
  return { manifest, files, output }
}
module.exports = { prepareNetlifyUpdates }
if (require.main === module) {
  const names = { '--manifest': 'manifest', '--directory': 'directory', '--output-dir': 'output', '--publish-dir': 'publishDir' }, options = {}
  for (let i = 2; i < process.argv.length; i += 2) { const key = names[process.argv[i]]; if (!key || !process.argv[i + 1]) throw new Error('Invalid staging option'); options[key] = process.argv[i + 1] }
  prepareNetlifyUpdates(options).then(({ files }) => console.log('Netlify update assets verified: ' + files.join(', '))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
