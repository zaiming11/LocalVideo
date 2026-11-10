const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const arm64 = process.argv.includes('--arm64')
const cache = path.join(__dirname, '.android-build')
const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : 'C:/Program Files/Common Files/Oracle/Java/javapath'
function run(command, args, cwd) { const r = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, cwd }); if (r.error) throw r.error; if (r.status) throw new Error('Host build failed') }
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
async function main() {
  run(process.execPath, [path.join(__dirname, 'build-tvbox-android.cjs')])
  const aapt = path.join(cache, 'aapt2.exe')
  if (!fs.existsSync(aapt)) {
    const url = 'https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/8.6.1-11315950/aapt2-8.6.1-11315950-windows.jar'
    const response = await fetch(url); if (!response.ok) throw new Error('aapt2 download failed')
    const bytes = Buffer.from(await response.arrayBuffer())
    const yauzl = require('../desktop/node_modules/yauzl')
    await new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      zip.on('error', reject)
      zip.on('entry', entry => {
        if (entry.fileName !== 'aapt2.exe') return zip.readEntry()
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error)
          const parts = []; stream.on('data', part => parts.push(part)); stream.on('error', reject)
          stream.on('end', () => { fs.writeFileSync(aapt, Buffer.concat(parts)); zip.close(); resolve() })
        })
      }); zip.on('end', () => reject(new Error('aapt2 missing'))); zip.readEntry()
    }))
  }
  const android = path.join(cache, 'android35.jar'), classes = path.join(cache, 'host-classes'), dex = path.join(cache, 'host-dex')
  fs.mkdirSync(classes, { recursive: true }); fs.mkdirSync(dex, { recursive: true })
  run(path.join(javaBin, 'javac.exe'), ['-encoding', 'UTF-8', '--release', '8', '-classpath', android + path.delimiter + path.join(cache, 'classes'), '-d', classes, ...walk(path.join(root, 'native/tvbox-host/src')).filter(f => f.endsWith('.java'))])
  const libs = ['gson', 'okhttp', 'okio', 'zxing', 'slf4j-api', 'slf4j-nop'].map(name => path.join(cache, name + '.jar'))
  run(path.join(javaBin, 'java.exe'), ['-cp', path.join(cache, 'r8.jar'), 'com.android.tools.r8.D8', '--min-api', '23', '--lib', android, '--output', dex, ...walk(classes).filter(f => f.endsWith('.class')), ...walk(path.join(cache, 'classes')).filter(f => f.endsWith('.class')), ...libs])
  const output = path.join(root, 'desktop/.android-runtime', arm64 ? 'localvideo-tvbox-host-arm64.apk' : 'localvideo-tvbox-host.apk')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const zigRoot = path.join(cache, 'ziglang'), zig = path.join(zigRoot, 'zig.exe')
  if (!fs.existsSync(zig)) {
    const zip = path.join(cache, 'ziglang-0.13.0.whl')
    if (!fs.existsSync(zip)) {
      const r = await fetch('https://files.pythonhosted.org/packages/e0/0c/66f4710aedf5544e15779ff9c6e770322986e15daf9299b1a4df0be19e09/ziglang-0.13.0-py3-none-win_amd64.whl', { signal: AbortSignal.timeout(300000) })
      if (!r.ok) throw new Error('Zig download failed'); fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()))
    }
    if (crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex') !== 'b64b2aa936ebbfeecfbb2611df331a5474edebe1246b98c2f56d6ae4d58b71fc') throw new Error('Zig checksum mismatch')
    run(path.join(javaBin, 'jar.exe'), ['xf', zip], cache)
  }
  const nativeRoot = path.join(cache, arm64 ? 'host-native-arm64' : 'host-native'), arm = path.join(nativeRoot, arm64 ? 'lib/arm64-v8a' : 'lib/armeabi-v7a')
  fs.mkdirSync(arm, { recursive: true })
  run(zig, ['cc', '-target', arm64 ? 'aarch64-linux-android' : 'arm-linux-android', '-shared', '-nostdlib', '-fPIC', '-Wl,-soname,liblocalvideo_abi.so', path.join(root, 'native/tvbox-host/abi-marker.c'), '-o', path.join(arm, 'liblocalvideo_abi.so')])
  run(aapt, ['link', '-I', android, '--manifest', path.join(root, 'native/tvbox-host/AndroidManifest.xml'), '-o', output])
  run(path.join(javaBin, 'jar.exe'), ['uf', output, '-C', dex, 'classes.dex'])
  run(path.join(javaBin, 'jar.exe'), ['uf', output, '-C', nativeRoot, 'lib'])
  const key = process.env.LOCALVIDEO_ANDROID_KEYSTORE || path.join(cache, 'host-development.p12')
  if (!fs.existsSync(key)) {
    if (process.env.LOCALVIDEO_ANDROID_KEYSTORE) throw new Error('Configured signing key does not exist')
    run(path.join(javaBin, 'keytool.exe'), ['-genkeypair', '-keystore', key, '-storepass', 'android', '-keypass', 'android', '-alias', 'localvideo', '-keyalg', 'RSA', '-validity', '10000', '-dname', 'CN=LocalVideo Development'])
  }
  const password = process.env.LOCALVIDEO_ANDROID_STOREPASS || 'android'
  run(path.join(javaBin, 'jarsigner.exe'), ['-keystore', key, '-storepass', password, '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', output, 'localvideo'])
  const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')
  fs.writeFileSync(output + '.sha256', hash + '\n'); console.log('Companion APK built: ' + hash)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
