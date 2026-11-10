const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/
export const DEFAULT_UPDATE_URL = 'https://github.com/zaiming11/LocalVideo/releases/latest/download/version.json'
export const DEFAULT_MIRROR_URL = 'https://gh-proxy.com/'
export function updateNetworkConfig(input = {}) {
  const downloadMode = ['auto', 'direct', 'custom'].includes(input.downloadMode) ? input.downloadMode : 'auto'
  let mirrorUrl = String(input.mirrorUrl || '').trim()
  if (mirrorUrl) {
    const url = new URL(mirrorUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.includes('https:')) throw new Error('镜像地址须为不含账号密码、参数的 HTTPS 前缀')
    mirrorUrl = url.href.replace(/\/*$/, '/')
  }
  if (downloadMode === 'custom' && !mirrorUrl) throw new Error('请填写镜像地址')
  return { downloadMode, mirrorUrl }
}
export function updateSources(url, config = {}) {
  const network = updateNetworkConfig(config)
  if (!url.startsWith('https://github.com/zaiming11/LocalVideo/releases/')) throw new Error('更新地址必须属于 LocalVideo GitHub Releases')
  const prefix = network.downloadMode === 'custom' ? network.mirrorUrl : DEFAULT_MIRROR_URL
  return network.downloadMode === 'direct' ? [url] : [prefix + url, url]
}
export function githubDownloadUrl(value, file) {
  const url = new URL(value)
  const segments = url.pathname.split('/')
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || segments.length !== 7 || segments.slice(1, 5).join('/') !== 'zaiming11/LocalVideo/releases/download' || !segments[5] || ['.', '..'].includes(decodeURIComponent(segments[5])) || segments[6] !== file) throw new Error('安装包下载地址必须属于 LocalVideo 的 GitHub Release')
  return url.href
}
function parts(version) {
  const match = VERSION.exec(String(version || '').replace(/^v/, ''))
  if (!match || String(version).length > 120) throw new Error('版本号须使用 1.2.3 或 1.2.3-alpha.1 格式')
  return { core: match.slice(1, 4), pre: match[4]?.split('.') || [] }
}
function numeric(a, b) { return a.length !== b.length ? Math.sign(a.length - b.length) : a === b ? 0 : a > b ? 1 : -1 }
export function compareVersions(left, right) {
  const a = parts(left), b = parts(right)
  for (let i = 0; i < 3; i++) { const result = numeric(a.core[i], b.core[i]); if (result) return result }
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (a.pre[i] === undefined || b.pre[i] === undefined) return a.pre[i] === undefined ? -1 : 1
    const x = a.pre[i], y = b.pre[i]; if (x === y) continue
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    return xn && yn ? numeric(x, y) : xn !== yn ? xn ? -1 : 1 : x > y ? 1 : -1
  }
  return 0
}
export function readRelease(input, platform, currentVersion) {
  const data = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input
  if (data?.schemaVersion !== 1 || !data.platforms || !['windows', 'android'].includes(platform)) throw new Error('版本管理文件格式不正确')
  const release = data.platforms[platform]
  if (!release) return null
  parts(release.version)
  const extension = platform === 'windows' ? 'exe' : 'apk'
  if (typeof release.file !== 'string' || release.file.length > 180 || !new RegExp('^[A-Za-z0-9][A-Za-z0-9._-]*\\.' + extension + '$', 'i').test(release.file)) throw new Error('安装包必须是更新文件夹内的 EXE / APK 文件名')
  if (!/^[a-f0-9]{64}$/i.test(release.sha256 || '') || !Number.isSafeInteger(release.size) || release.size <= 0 || release.size > 4 * 1024 ** 3) throw new Error('版本文件缺少有效的安装包大小或 SHA-256')
  if (platform === 'android' && (!Number.isSafeInteger(release.versionCode) || release.versionCode <= 0)) throw new Error('Android 更新缺少 versionCode')
  let chunks
  if (release.chunks !== undefined) {
    if (platform !== 'windows' || !Array.isArray(release.chunks) || !release.chunks.length || release.chunks.length > 128) throw new Error('安装包分片信息无效')
    const seen = new Set()
    chunks = release.chunks.map(chunk => {
      if (typeof chunk.file !== 'string' || chunk.file.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.part\d{3}$/.test(chunk.file) || seen.has(chunk.file) || !Number.isSafeInteger(chunk.size) || chunk.size <= 0 || chunk.size > 64 * 1024 ** 2 || !/^[a-f0-9]{64}$/i.test(chunk.sha256 || '')) throw new Error('安装包分片信息无效')
      seen.add(chunk.file); return { file: chunk.file, size: chunk.size, sha256: chunk.sha256.toLowerCase() }
    })
    if (chunks.reduce((sum, chunk) => sum + chunk.size, 0) !== release.size) throw new Error('安装包分片总大小不一致')
  }
  const downloadUrl = release.downloadUrl === undefined ? undefined : githubDownloadUrl(release.downloadUrl, release.file)
  return { version: release.version, file: release.file, downloadUrl, sha256: release.sha256.toLowerCase(), size: release.size, chunks, versionCode: release.versionCode, notes: String(release.notes || '').slice(0, 4000), publishedAt: String(release.publishedAt || data.publishedAt || ''), available: compareVersions(release.version, currentVersion) > 0 }
}
