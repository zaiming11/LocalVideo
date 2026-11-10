import { getNativeHost } from '../native-host.js'
let bridge = null
let serial = 0
export function isAndroidTVBox() {
  // #ifdef APP-PLUS
  return typeof plus !== 'undefined' && plus.os.name === 'Android'
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}
function invoke(object, method, ...args) { return plus.android.invoke(object, method, ...args) }
function nativeBridge() {
  if (bridge) return bridge
  if (!isAndroidTVBox()) throw new Error('Android 插件只能在安卓 App 中运行')
  const { activity, directory, loader } = getNativeHost()
  const type = invoke(loader, 'loadClass', 'io.localvideo.tvbox.Bridge')
  const instance = invoke(type, 'newInstance')
  if (!instance) throw new Error('Android 插件宿主加载失败，请重新编译运行')
  invoke(instance, 'configure', activity, directory)
  bridge = instance
  return bridge
}
export function invokeAndroidSpider(site, action, args = {}) {
  return callNative({ site, action, args }).then(body => ({ body, url: site.jar?.split(';md5;')[0] || '' }))
}
export function requestAndroidTVBox(url, headers = {}) {
  return callNative({ action: 'request', args: { url, headers } }, 'enqueueRequest')
}
export function importAndroidTVBoxFolder(uri) { return callNative({ action: 'localImport', args: { uri } }, 'enqueueRequest') }
export function restoreAndroidTVBoxFolder(id) { return callNative({ action: 'localRestore', args: { id } }, 'enqueueRequest') }
function callNative(payload, enqueueMethod = 'enqueue') {
  return new Promise((resolve, reject) => {
    let host
    try { host = nativeBridge() } catch (error) { reject(error); return }
    const id = String(Date.now()) + '-' + (++serial), started = Date.now()
    try { invoke(host, enqueueMethod, id, JSON.stringify(payload)) } catch (error) { reject(error); return }
    const poll = () => {
      try {
        const raw = invoke(host, 'poll', id)
        if (raw) {
          const result = JSON.parse(raw)
          if (result.ok) resolve(result.body)
          else reject(new Error((payload.action === 'request' ? '配置或接口请求失败：' : 'Android 插件执行失败：') + result.error))
        } else if (Date.now() - started > 60000) reject(new Error(payload.action === 'request' ? '配置或接口请求超时' : 'Android 插件响应超时，请切换站点'))
        else setTimeout(poll, 150)
      } catch (error) { reject(error) }
    }
    setTimeout(poll, 100)
  })
}
export function androidPlaybackUrl(url, headers = {}) {
  if (!isAndroidTVBox()) return url
  if (!Object.keys(headers).length && !/^http:\/\/127\.0\.0\.1:9978\/proxy/.test(url)) return url
  return String(invoke(nativeBridge(), 'playbackUrl', url, JSON.stringify(headers)))
}
