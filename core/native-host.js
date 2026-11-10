// #ifdef APP-PLUS
import { NATIVE_BRIDGE_HASH } from './tvbox/native-version.js'
// #endif
let cached
export function nativeInvoke(object, method, ...args) { return plus.android.invoke(object, method, ...args) }
export function getNativeHost() {
  if (cached) return cached
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') throw new Error('此功能需要 Android App')
  const invoke = nativeInvoke, activity = plus.android.runtimeMainActivity()
  const directory = invoke(invoke(activity, 'getFilesDir'), 'getAbsolutePath') + '/localvideo-tvbox'
  invoke(plus.android.newObject('java.io.File', directory), 'mkdirs')
  const destination = directory + '/host-' + NATIVE_BRIDGE_HASH + '.jar'
  const file = plus.android.newObject('java.io.File', destination)
  if (!invoke(file, 'exists')) {
    const source = plus.io.convertLocalFileSystemURL('_www/static/tvbox-native/bridge.jar').replace(/^file:\/\//, '')
    const assetIndex = source.indexOf('/android_asset/')
    const input = assetIndex >= 0 ? invoke(invoke(activity, 'getAssets'), 'open', source.slice(assetIndex + '/android_asset/'.length)) : plus.android.newObject('java.io.FileInputStream', source)
    const output = plus.android.newObject('java.io.FileOutputStream', destination)
    let complete = false
    try {
      const incoming = invoke('java.nio.channels.Channels', 'newChannel', input), outgoing = invoke(output, 'getChannel')
      const count = Number(invoke(outgoing, 'transferFrom', incoming, 0, 16777216))
      if (!(count > 0)) throw new Error('原生组件复制失败')
      complete = true
    } finally { invoke(input, 'close'); invoke(output, 'close'); if (!complete) invoke(file, 'delete') }
    if (!invoke(file, 'setReadOnly')) throw new Error('无法设置原生组件只读权限')
  }
  const loader = plus.android.newObject('dalvik.system.DexClassLoader', destination, directory, null, invoke(activity, 'getClassLoader'))
  cached = { loader, directory, activity }
  return cached
}
