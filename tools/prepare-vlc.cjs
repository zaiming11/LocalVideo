const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const yauzl = require('../desktop/node_modules/yauzl')
const root = path.resolve(__dirname, '..')
const cache = path.join(__dirname, '.android-build', 'vlc')
const ANDROID = '3.7.7', WINDOWS = '3.0.24'
const sha = (file, algorithm = 'sha256') => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex')
async function download(url, file) {
  if (fs.existsSync(file)) return
  console.log('Downloading ' + path.basename(file))
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) })
  if (!response.ok) throw new Error('Download HTTP ' + response.status + ': ' + url)
  const output = fs.openSync(file + '.part', 'w'); let size = 0, reported = 0
  try { for await (const bytes of response.body) { fs.writeSync(output, bytes); size += bytes.length; if (size - reported > 16 * 1024 * 1024) { console.log(path.basename(file) + ': ' + Math.round(size / 1048576) + ' MB'); reported = size } } }
  finally { fs.closeSync(output) }
  fs.renameSync(file + '.part', file)
}
function extract(zipFile, destinationFor) {
  return new Promise((resolve, reject) => yauzl.open(zipFile, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error)
    zip.on('error', reject); zip.on('end', resolve)
    zip.on('entry', entry => {
      const destination = destinationFor(entry.fileName)
      if (!destination || entry.fileName.endsWith('/')) return zip.readEntry()
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      zip.openReadStream(entry, (error, input) => {
        if (error) return reject(error)
        const output = fs.createWriteStream(destination)
        input.on('error', reject); output.on('error', reject)
        output.on('finish', () => zip.readEntry()); input.pipe(output)
      })
    })
    zip.readEntry()
  }))
}
async function main() {
  fs.mkdirSync(cache, { recursive: true })
  const args = process.argv.slice(2), all = !args.length
  const lockFile = path.join(root, 'native', 'vlc', 'dependencies.json')
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : {}
  if (all || args.includes('--android')) {
    const base = `https://repo.maven.apache.org/maven2/org/videolan/android/libvlc-all/${ANDROID}/libvlc-all-${ANDROID}.aar`
    const file = path.join(cache, `libvlc-all-${ANDROID}.aar`)
    await download(base, file)
    const expected = (await (await fetch(base + '.sha1')).text()).trim().split(/\s/)[0]
    if (!/^[a-f0-9]{40}$/i.test(expected) || sha(file, 'sha1') !== expected.toLowerCase()) throw new Error('LibVLC Android checksum mismatch')
    if (lock.android?.sha256 && lock.android.version === ANDROID && lock.android.sha256 !== sha(file)) throw new Error('Pinned Android artifact changed')
    const destination = path.join(root, 'static', 'vlc-native')
    await extract(file, name => {
      if (name === 'classes.jar') return path.join(cache, 'libvlc-classes.jar')
      const match = /^jni\/(arm64-v8a|armeabi-v7a)\/([A-Za-z0-9_.+-]+\.so)$/.exec(name)
      return match ? path.join(destination, match[1], match[2]) : null
    })
    lock.android = { version: ANDROID, url: base, sha256: sha(file), abis: ['arm64-v8a', 'armeabi-v7a'] }
    // Stock LibVLC also contains optional display/renderer helpers. Include their
    // Java dependencies rather than depending on the host App's AndroidX version.
    const support = [
      ['androidx.lifecycle', 'lifecycle-livedata-core', '2.0.0', 'aar'],
      ['androidx.lifecycle', 'lifecycle-common', '2.0.0', 'jar'],
      ['androidx.lifecycle', 'lifecycle-runtime', '2.0.0', 'aar'],
      ['androidx.arch.core', 'core-common', '2.0.0', 'jar'],
      ['androidx.arch.core', 'core-runtime', '2.0.0', 'aar'],
      ['androidx.collection', 'collection', '1.0.0', 'jar'],
      ['androidx.core', 'core', '1.0.0', 'aar'],
      ['androidx.versionedparcelable', 'versionedparcelable', '1.0.0', 'aar']
    ]
    const previous = lock.androidSupport || []
    lock.androidSupport = []
    for (const [group, name, version, extension] of support) {
      const url = `https://dl.google.com/dl/android/maven2/${group.replace(/\./g, '/')}/${name}/${version}/${name}-${version}.${extension}`
      const file = path.join(cache, `${group}-${name}-${version}.${extension}`)
      await download(url, file)
      const expected = (await (await fetch(url + '.sha1', { signal: AbortSignal.timeout(30000) })).text()).trim().split(/\s/)[0]
      if (!/^[a-f0-9]{40}$/i.test(expected) || sha(file, 'sha1') !== expected.toLowerCase()) throw new Error('AndroidX checksum mismatch: ' + name)
      const pinned = previous.find(item => item.url === url)
      if (pinned && pinned.sha256 !== sha(file)) throw new Error('Pinned AndroidX artifact changed: ' + name)
      const output = `${group}-${name}-${version}-classes.jar`
      if (extension === 'aar') await extract(file, name => name === 'classes.jar' ? path.join(cache, output) : null)
      else fs.copyFileSync(file, path.join(cache, output))
      lock.androidSupport.push({ url, sha256: sha(file), classes: output })
    }
    console.log('Android LibVLC libraries prepared')
  }
  if (all || args.includes('--windows')) {
    const base = `https://download.videolan.org/pub/videolan/vlc/${WINDOWS}/win64/vlc-${WINDOWS}-win64.zip`
    const file = path.join(cache, `vlc-${WINDOWS}-win64.zip`)
    await download(base, file)
    const expected = (await (await fetch(base + '.sha256')).text()).trim().split(/\s/)[0]
    if (!/^[a-f0-9]{64}$/i.test(expected) || sha(file) !== expected.toLowerCase()) throw new Error('LibVLC Windows checksum mismatch')
    if (lock.windows?.sha256 && lock.windows.version === WINDOWS && lock.windows.sha256 !== sha(file)) throw new Error('Pinned Windows artifact changed')
    const destination = path.join(root, 'desktop', 'vlc-runtime')
    await extract(file, name => {
      const parts = name.split('/'); parts.shift(); const relative = parts.join('/')
      if (!relative || parts.some(part => part === '..' || part === '.' || part.includes('\\'))) return null
      const wanted = parts.length === 1 && /\.dll$/i.test(relative) || relative.startsWith('plugins/') && !relative.startsWith('plugins/gui/') || /^(?:COPYING|AUTHORS|THANKS)(?:\.txt)?$/i.test(relative)
      const target = path.resolve(destination, relative)
      if (!target.startsWith(path.resolve(destination) + path.sep)) throw new Error('Invalid VLC archive path')
      return wanted ? target : null
    })
    lock.windows = { version: WINDOWS, url: base, sha256: sha(file), arch: 'x64' }
    fs.writeFileSync(path.join(destination, 'runtime.json'), JSON.stringify(lock.windows, null, 2))
    console.log('Windows LibVLC runtime prepared')
  }
  fs.mkdirSync(path.dirname(lockFile), { recursive: true })
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n')
  for (const destination of [all || args.includes('--android') ? path.join(root,'static/vlc-native') : null, all || args.includes('--windows') ? path.join(root,'desktop/vlc-runtime') : null].filter(Boolean)) {
    for (const name of ['COPYING.LIB', 'THIRD-PARTY.txt']) fs.copyFileSync(path.join(root,'native/vlc',name),path.join(destination,name))
  }
  if (all || args.includes('--android')) fs.copyFileSync(path.join(root,'native/vlc/LICENSE-AndroidX.txt'),path.join(root,'static/vlc-native/LICENSE-AndroidX.txt'))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
