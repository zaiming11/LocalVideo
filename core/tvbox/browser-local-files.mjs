import { BROWSER_LOCAL_ROOT } from './local-reference.mjs'

const DB_NAME = 'localvideo_tvbox_folders_v1'
const folders = new Map()
const MAX_TEXT = 8 * 1024 * 1024
const MAX_FOLDER = 256 * 1024 * 1024
const configPattern = /(?:^|[,{])\s*["']?(?:sites|urls|lives)["']?\s*:/m

export function canImportBrowserTVBoxFolder() {
  return typeof document !== 'undefined' && typeof indexedDB !== 'undefined' && 'webkitdirectory' in document.createElement('input')
}

function database() {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('folders', { keyPath: 'id' })
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => reject(new Error('浏览器本地存储不可用，请允许本站存储数据后重试'))
    request.onblocked = () => { blocked = true; reject(new Error('本地存储正在被其他页面占用，请关闭其他页面后重试')) }
  })
}

async function storedFolder(id, value) {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('folders', value ? 'readwrite' : 'readonly')
      const request = value ? transaction.objectStore('folders').put(value) : transaction.objectStore('folders').get(id)
      transaction.oncomplete = () => resolve(value || request.result)
      transaction.onabort = transaction.onerror = () => reject(new Error(value ? '文件夹保存失败，浏览器空间可能不足，请选择更小的配置文件夹' : '无法读取已保存的文件夹，请重新选择'))
    })
  } finally { db.close() }
}

function filePath(value) {
  const parts = String(value).split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) throw new Error('配置文件路径无效，请重新选择文件夹')
  return parts.join('/')
}

function describe(record) {
  return { id: record.id, name: record.name, baseUrl: BROWSER_LOCAL_ROOT + record.id + '/', candidates: record.candidates }
}

function remember(record) {
  const folder = { ...record, files: new Map(record.files.map(entry => [entry.path, entry.file])), media: new Map() }
  folders.set(record.id, folder)
  return describe(record)
}

export async function importBrowserTVBoxFiles(selected) {
  const files = [], candidates = []
  let name = '', total = 0, configSize = 0
  if (selected.length > 4000) throw new Error('文件夹内容过多，请选择更具体的配置目录')
  for (const file of selected) {
    const fullPath = filePath(file.webkitRelativePath)
    const parts = fullPath.split('/')
    if (parts.length < 2 || name && name !== parts[0]) throw new Error('请选择一个完整的配置文件夹')
    name = parts.shift()
    if (parts.some(part => part.startsWith('.'))) continue
    const path = parts.join('/')
    total += file.size
    if (total > MAX_FOLDER) throw new Error('文件夹超过 256 MiB，请选择更具体的配置目录')
    files.push({ path, file })
    if (!/\.(json5?|txt|conf)$/i.test(path) || file.size > MAX_TEXT || !configPattern.test(await file.text())) continue
    configSize += file.size
    if (candidates.length >= 64 || configSize > 32 * 1024 * 1024) throw new Error('主配置过多或过大，请选择更具体的文件夹')
    candidates.push({ path })
  }
  if (!candidates.length) throw new Error('目录中没有找到包含 sites、urls 或 lives 的 JSON/TXT 主配置')
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const record = { id, name, files, candidates: candidates.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })) }
  await storedFolder(id, record)
  return remember(record)
}

export function pickBrowserTVBoxFolder() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.webkitdirectory = true
    input.setAttribute('aria-label', '选择本地 TVBox 配置文件夹')
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;'
    document.body.appendChild(input)
    const remove = () => input.remove()
    input.addEventListener('change', async () => {
      try { const files = Array.from(input.files || []); resolve(files.length ? await importBrowserTVBoxFiles(files) : null) }
      catch (error) { reject(error) }
      finally { remove() }
    }, { once: true })
    input.addEventListener('cancel', () => { remove(); resolve(null) }, { once: true })
    try { input.click() } catch (error) { remove(); reject(error) }
  })
}

export async function restoreBrowserTVBoxFolder(id) {
  if (!/^[a-f0-9]{32}$/.test(id || '')) throw new Error('本地文件夹标识无效')
  if (folders.has(id)) return describe(folders.get(id))
  const record = await storedFolder(id)
  if (!record) throw new Error('浏览器未保存此配置文件夹，请重新选择')
  return remember(record)
}

function resource(url) {
  const target = new URL(url)
  if (target.origin + '/' !== BROWSER_LOCAL_ROOT) throw new Error('本地配置地址无效')
  const [id, ...parts] = target.pathname.slice(1).split('/').map(decodeURIComponent)
  if (!/^[a-f0-9]{32}$/.test(id) || parts.some(part => /\//.test(part))) throw new Error('本地配置地址无效')
  return { id, path: filePath(parts.join('/')) }
}

export async function requestBrowserTVBoxFile(url) {
  const { id, path } = resource(url)
  await restoreBrowserTVBoxFolder(id)
  const file = folders.get(id).files.get(path)
  if (!file) throw new Error('所选文件夹中没有找到：' + path)
  if (file.size > MAX_TEXT) throw new Error('本地配置文件超过 8 MiB')
  return { body: await file.text(), url }
}

export function browserTVBoxMediaUrl(url) {
  try {
    const { id, path } = resource(url)
    const folder = folders.get(id), file = folder?.files.get(path)
    if (!file) return ''
    if (!folder.media.has(path)) folder.media.set(path, URL.createObjectURL(file))
    return folder.media.get(path)
  } catch { return '' }
}
