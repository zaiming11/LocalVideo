const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2), positional = []
const options = {}
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    if (!['--tag', '--output-dir', '--manifest'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid prepare option: ' + args[i])
    options[args[i]] = args[++i]
  } else positional.push(args[i])
}
const stage = path.resolve(options['--output-dir'] || path.join(root, 'desktop/.update-publish'))
const manifestFile = path.resolve(options['--manifest'] || path.join(root, 'updates/version.json'))
const win = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8'))
const android = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
async function prepare(input, name, version, extra = {}) {
  const source = path.resolve(input), target = path.join(stage, name)
  if (!fs.existsSync(source)) throw new Error('Package not found: ' + source)
  if (!path.resolve(target).startsWith(path.resolve(stage) + path.sep)) throw new Error('Invalid staging path')
  const samePath = process.platform === 'win32' ? source.toLowerCase() === target.toLowerCase() : source === target
  if (!samePath) { if (fs.existsSync(target)) fs.unlinkSync(target); fs.linkSync(source, target) }
  const size = fs.statSync(target).size
  if (size <= 0 || size > 4 * 1024 ** 3) throw new Error('Invalid package size')
  const hash = crypto.createHash('sha256')
  for await (const bytes of fs.createReadStream(target)) hash.update(bytes)
  return { version, file: name, size, sha256: hash.digest('hex'), ...extra }
}

async function main() {
  fs.mkdirSync(stage, { recursive: true })
  const tag = options['--tag'] || `v${win.version}-android-${android.versionName}`
  if (!tag || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(tag)) throw new Error('Invalid GitHub release tag')
  const downloadBase = `https://github.com/zaiming11/LocalVideo/releases/download/${tag}/`
  const windowsName = `LocalVideo-${win.version}-Windows-x64-Setup.exe`, androidName = `LocalVideo-${android.versionName}-Android.apk`
  const windowsInput = positional[0] || path.join(root, 'desktop/dist', windowsName)
  const androidInput = positional[1] || path.join(stage, androidName)
  const manifest = { schemaVersion: 1, publishedAt: new Date().toISOString(), platforms: {
    windows: await prepare(windowsInput, windowsName, win.version, { downloadUrl: downloadBase + windowsName, notes: 'Windows 应用更新，请查看 GitHub Release 的更新说明。' }),
    android: await prepare(androidInput, androidName, android.versionName, { versionCode: Number(android.versionCode), downloadUrl: downloadBase + androidName, notes: 'Android 应用更新，请查看 GitHub Release 的更新说明。' })
  } }
  const { readRelease } = await import(pathToFileURL(path.join(root, 'core/update/model.mjs')).href)
  readRelease(manifest, 'windows', '0.0.0'); readRelease(manifest, 'android', '0.0.0')
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true }); fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(path.join(stage, 'version.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Prepared GitHub Release ${tag}: Windows ${win.version}, Android ${android.versionName}; manifest: updates/version.json`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
