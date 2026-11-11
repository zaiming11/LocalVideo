const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const cache = path.join(__dirname, '.android-build')
const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : 'C:/Program Files/Common Files/Oracle/Java/javapath'
const java = path.join(javaBin, 'java.exe')
const javac = path.join(javaBin, 'javac.exe')
const artifacts = [
  ['r8.jar', 'https://dl.google.com/dl/android/maven2/com/android/tools/r8/9.5.29/r8-9.5.29.jar', 'f8c762ff84640b10083b934a47278758a7665977e618fab0c927fff00521dea3'],
  ['gson.jar', 'https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar'],
  ['okhttp.jar', 'https://repo.maven.apache.org/maven2/com/squareup/okhttp3/okhttp/3.12.13/okhttp-3.12.13.jar'],
  ['okio.jar', 'https://repo.maven.apache.org/maven2/com/squareup/okio/okio/1.17.5/okio-1.17.5.jar'],
  ['zxing.jar', 'https://repo.maven.apache.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar'],
  ['slf4j-api.jar', 'https://repo.maven.apache.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar'],
  ['slf4j-nop.jar', 'https://repo.maven.apache.org/maven2/org/slf4j/slf4j-nop/1.7.36/slf4j-nop-1.7.36.jar']
]
function run(command, args) { const r = spawnSync(command, args, { stdio: 'inherit' }); if (r.error) throw r.error; if (r.status) throw new Error('Native bridge compilation failed') }
async function main() {
  run(process.execPath, [path.join(__dirname,'build-tvbox-js.cjs')])
  run(process.execPath, [path.join(__dirname,'build-tvbox-python.cjs')])
  fs.mkdirSync(cache, { recursive: true })
  const androidJar = path.join(cache, 'android35.jar')
  if (!fs.existsSync(androidJar)) {
    const response = await fetch('https://dl.google.com/android/repository/platform-35_r02.zip', { signal: AbortSignal.timeout(90000) })
    if (!response.ok) throw new Error('Android SDK download failed')
    const zipData = Buffer.from(await response.arrayBuffer())
    if (crypto.createHash('sha1').update(zipData).digest('hex') !== '0bb560a90a7a2cbd0dd8348224d518b638fe7949') throw new Error('Android SDK checksum mismatch')
    const yauzl = require('../desktop/node_modules/yauzl')
    await new Promise((resolve, reject) => yauzl.fromBuffer(zipData, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      let found = false
      zip.on('error', reject)
      zip.on('entry', entry => {
        if (!entry.fileName.endsWith('/android.jar')) return zip.readEntry()
        found = true
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error)
          const parts = []
          stream.on('data', part => parts.push(part)); stream.on('error', reject)
          stream.on('end', () => { fs.writeFileSync(androidJar, Buffer.concat(parts)); zip.close(); resolve() })
        })
      })
      zip.on('end', () => { if (!found) reject(new Error('Missing android.jar')) })
      zip.readEntry()
    }))
  }
  if (crypto.createHash('sha256').update(fs.readFileSync(androidJar)).digest('hex') !== '4566663c3876e022b4fa4ced8c8697c4ab1688267f090114fd92d027b32e619b') throw new Error('android.jar checksum mismatch')
  for (const [name, url, sha] of artifacts) {
    const file = path.join(cache, name)
    if (!fs.existsSync(file)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error('Dependency download: HTTP ' + response.status)
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
    }
    if (sha && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== sha) throw new Error('Dependency checksum mismatch: ' + name)
  }
  const classes = path.resolve(cache, 'classes')
  if (!classes.startsWith(path.resolve(cache) + path.sep)) throw new Error('Invalid build output directory')
  fs.rmSync(classes, { recursive: true, force: true }); fs.mkdirSync(classes, { recursive: true })
  const sourceRoot = path.join(root, 'native/tvbox/src')
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
  const cp = androidJar + path.delimiter + path.join(cache, 'okhttp.jar')
  run(javac, ['-J-Duser.language=en', '-encoding', 'UTF-8', '--release', '8', '-Xlint:-options', '-classpath', cp, '-d', classes, ...walk(sourceRoot).filter(file => file.endsWith('.java'))])
  const output = path.join(root, 'static/tvbox-native/bridge.jar')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  run(java, ['-cp', path.join(cache, 'r8.jar'), 'com.android.tools.r8.D8', '--min-api', '23', '--lib', androidJar, '--output', output, ...walk(classes).filter(file => file.endsWith('.class')), ...artifacts.slice(1).map(([name]) => path.join(cache, name))])
  const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')
  fs.writeFileSync(path.join(root, 'core/tvbox/native-version.js'), "export const NATIVE_BRIDGE_HASH = '" + hash + "'\n")
  console.log('Android Spider bridge built: ' + hash)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
