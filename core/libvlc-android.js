import { VLC_NATIVE } from './vlc-native-version.js'
let host
const invoke = (...args) => plus.android.invoke(...args)
function copyAsset(activity, relative, destination, expectedSize) {
  const file = plus.android.newObject('java.io.File', destination)
  if (invoke(file, 'exists') && (!expectedSize || Number(invoke(file, 'length')) === expectedSize)) return
  if (invoke(file, 'exists')) invoke(file, 'delete')
  const source = plus.io.convertLocalFileSystemURL('_www/static/vlc-native/' + relative).replace(/^file:\/\//, '')
  const offset = source.indexOf('/android_asset/')
  const input = offset < 0 ? plus.android.newObject('java.io.FileInputStream', source) : invoke(invoke(activity, 'getAssets'), 'open', source.slice(offset + 15))
  const output = plus.android.newObject('java.io.FileOutputStream', destination)
  let complete = false
  try {
    const incoming = invoke('java.nio.channels.Channels', 'newChannel', input)
    const outgoing = invoke(output, 'getChannel')
    let total = 0, count
    do { count = Number(invoke(outgoing, 'transferFrom', incoming, total, 8388608)); total += count } while (count > 0)
    if (!total || expectedSize && total !== expectedSize) throw new Error('LibVLC 组件复制不完整')
    complete = true
  } finally { invoke(input, 'close'); invoke(output, 'close'); if (!complete) invoke(file, 'delete') }
  if (!invoke(file, 'setReadOnly')) throw new Error('无法设置 LibVLC 组件权限')
}
function loadHost() {
  if (host) return host
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') throw new Error('LibVLC 播放器目前支持 Android 和 Windows')
  const activity = plus.android.runtimeMainActivity()
  const process64 = !!invoke('android.os.Process', 'is64Bit')
  const abi = process64 ? 'arm64-v8a' : 'armeabi-v7a'
  const architecture = String(invoke('java.lang.System', 'getProperty', 'os.arch'))
  if (/x86|i686|amd64/.test(architecture)) throw new Error('此原生组件面向 ARM 安卓设备，当前模拟器架构不支持')
  const directory = invoke(invoke(activity, 'getFilesDir'), 'getAbsolutePath') + '/localvideo-vlc/' + VLC_NATIVE.hash
  invoke(plus.android.newObject('java.io.File', directory + '/lib'), 'mkdirs')
  copyAsset(activity, 'player.jar', directory + '/player.jar')
  for (const lib of VLC_NATIVE.libs[abi]) copyAsset(activity, abi + '/' + lib.name, directory + '/lib/' + lib.name, lib.size)
  const loader = plus.android.newObject('dalvik.system.DexClassLoader', directory + '/player.jar', directory, directory + '/lib', invoke(activity, 'getClassLoader'))
  host = { activity, type: invoke(loader, 'loadClass', 'io.localvideo.player.VlcPlayer'), loader }
  return host
}
export function createAndroidVlc(onEvent) {
  const { type, activity } = loadHost()
  const native = invoke(type, 'newInstance')
  invoke(native, 'init', activity)
  let generation = 0, disposed = false, opened = false
  const command = (action, input = {}) => { if (!disposed) invoke(native, 'command', JSON.stringify({ action, ...input })) }
  const timer = setInterval(() => {
    if (disposed || !opened) return
    try {
      const state = JSON.parse(invoke(native, 'poll'))
      if (state.generation !== generation) return
      for (const event of state.events) if (event.generation === generation) onEvent(event.type, { ...state, ...event })
      onEvent('timeupdate', state)
    } catch (error) { onEvent('error', { errMsg: String(error.message || error) }); clearInterval(timer) }
  }, 250)
  return {
    open(src) { opened = true; command('open', { src, generation: ++generation }) },
    suspend() { opened = false; generation++; command('pause') },
    play: () => command('play'), pause: () => command('pause'),
    seek: seconds => command('seek', { value: Math.round(seconds * 1000) }),
    playbackRate: value => command('rate', { value }),
    layout: input => command('layout', input),
    controls: (visible, locked, live = false) => command('controls', { visible, locked, live }),
    visible: value => command('visible', { value }),
    release() { if (disposed) return; clearInterval(timer); disposed = true; invoke(native, 'release') }
  }
}
