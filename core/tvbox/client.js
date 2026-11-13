import { DEFAULT_HEADERS, localOrigin, resolveEpisode, apiUrl } from './engine.mjs'
import { isAndroidTVBox, invokeAndroidSpider, androidPlaybackUrl, requestAndroidTVBox } from './android.js'
import { restoreLocalRecipe } from './local-files.js'
// #ifdef H5
import { isBrowserLocalUrl } from './local-reference.mjs'
import { requestBrowserTVBoxFile, browserTVBoxMediaUrl } from './browser-local-files.mjs'
// #endif
export { isAndroidTVBox }
export function hasAndroidEngine() {
  return isAndroidTVBox()
}
export function invokeTVBoxPlugin(site, action, args = {}) {
  return invokeAndroidSpider(site, action, args)
}

export async function requestTVBoxSite(site, action, args, configUrl) {
  if (site.type === 3 && hasAndroidEngine()) return invokeTVBoxPlugin(site, action, args)
  return requestTVBox(apiUrl(site, action, args), site.headers, configUrl)
}

export async function requestTVBox(url, headers = {}, configUrl = url) {
  const input = { url, headers: { ...DEFAULT_HEADERS, ...headers }, allowLocal: localOrigin(configUrl) }
  // #ifdef H5
  if (window.localVideoDesktop?.tvboxRequest) return window.localVideoDesktop.tvboxRequest(input)
  if (isBrowserLocalUrl(url)) return requestBrowserTVBoxFile(url)
  const response = await fetch('/__tvbox/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '无法读取接口')
  return data
  // #endif
  // #ifndef H5
  if (isAndroidTVBox()) return requestAndroidTVBox(url, input.headers)
  return new Promise((resolve, reject) => uni.request({ url, header: input.headers, dataType: 'text', timeout: 20000,
    success: result => result.statusCode >= 200 && result.statusCode < 300 ? resolve({ body: result.data, url }) : reject(new Error(`接口返回 HTTP ${result.statusCode}`)),
    fail: () => reject(new Error('接口请求失败，请检查网络与地址')) }))
  // #endif
}
export function tvboxMediaUrl(url, headers = {}, allowLocal = false) {
  if (!url) return ''
  // #ifdef H5
  // Vue's reactive header objects cannot cross Electron's context bridge.
  if (window.localVideoDesktop?.tvboxMediaUrl) return window.localVideoDesktop.tvboxMediaUrl(url, { ...headers }, allowLocal)
  if (isBrowserLocalUrl(url)) return browserTVBoxMediaUrl(url)
  const bytes = new TextEncoder().encode(JSON.stringify({ url, headers, allowLocal }))
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
  return '/__tvbox/media/' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  // #endif
  // #ifndef H5
  return androidPlaybackUrl(url, headers)
  // #endif
}
export async function resolveTVBoxVideo(video) {
  const resolved = await resolveEpisode(await restoreLocalRecipe(video.online), requestTVBox, hasAndroidEngine() ? invokeTVBoxPlugin : null)
  return { ...resolved, url: tvboxMediaUrl(resolved.url, resolved.headers, resolved.allowLocal) }
}
let hlsPromise
export function loadHls() {
  // #ifdef H5
  if (window.Hls) return Promise.resolve(window.Hls)
  if (!hlsPromise) hlsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/static/vendor/hls.min.js'
    script.onload = () => resolve(window.Hls)
    script.onerror = () => { hlsPromise = null; script.remove(); reject(new Error('HLS 播放组件加载失败')) }
    document.head.appendChild(script)
  })
  return hlsPromise
  // #endif
}
