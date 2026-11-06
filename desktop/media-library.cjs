const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')

const extensions = ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'webm', 'ts', 'm2ts', 'mpg', 'mpeg', '3gp', 'ogv', 'rmvb', 'rm', 'asf', 'vob', 'f4v']
const mimeTypes = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.ogv': 'video/ogg', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t' }
const isVideo = (file) => extensions.includes(path.extname(file).slice(1).toLowerCase())

class MediaLibrary {
  constructor(registryFile) {
    this.registryFile = registryFile
    this.files = new Map()
    try {
      for (const [id, file] of Object.entries(JSON.parse(fs.readFileSync(registryFile, 'utf8')))) {
        if (/^[a-f0-9]{64}$/.test(id) && typeof file === 'string' && path.isAbsolute(file) && isVideo(file)) this.files.set(id, file)
      }
    } catch { /* First launch or unreadable old registry. */ }
  }
  async addPaths(paths) {
    const entries = []
    const visited = new Set()
    const walk = async (file, folder, depth = 0) => {
      if (depth > 32) return
      let stat
      try { stat = await fs.promises.lstat(file) } catch { return }
      // Do not follow junctions or symbolic links outside the selected folder.
      if (stat.isSymbolicLink()) return
      if (stat.isDirectory()) {
        let children
        try { children = await fs.promises.readdir(file) } catch { return }
        children.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
        for (const name of children) {
          if (name.startsWith('.') || name === 'node_modules') continue
          await walk(path.join(file, name), folder ? `${folder}/${path.basename(file)}` : path.basename(file), depth + 1)
        }
        return
      }
      if (!stat.isFile() || !isVideo(file) || !stat.size) return
      const absolute = path.resolve(file)
      const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute
      if (visited.has(key)) return
      visited.add(key)
      const id = crypto.createHash('sha256').update(key).digest('hex')
      this.files.set(id, absolute)
      entries.push({ file: { name: path.basename(file), size: stat.size, lastModified: stat.mtimeMs, type: mimeTypes[path.extname(file).toLowerCase()] || 'video/mp4', desktopUrl: `localmedia://library/${id}`, desktopId: id }, folder: folder || path.basename(path.dirname(file)) })
    }
    for (const file of paths) if (typeof file === 'string' && path.isAbsolute(file)) await walk(file, '')
    await fs.promises.mkdir(path.dirname(this.registryFile), { recursive: true })
    const temp = `${this.registryFile}.tmp`
    await fs.promises.writeFile(temp, JSON.stringify(Object.fromEntries(this.files)))
    await fs.promises.rename(temp, this.registryFile)
    return entries
  }
  resolve(url) {
    try {
      const target = new URL(url)
      if (target.protocol !== 'localmedia:' || target.hostname !== 'library') return null
      return this.files.get(target.pathname.slice(1)) || null
    } catch { return null }
  }
}

async function fileResponse(request, file, contentType) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  let stat
  try { stat = await fs.promises.stat(file) } catch { return new Response('文件已移动或删除，请重新导入', { status: 404 }) }
  if (!stat.isFile()) return new Response(null, { status: 404 })
  let start = 0
  let end = stat.size - 1
  const range = request.headers.get('range')
  const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': 'localvideo://app' }
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    if (!match[1]) start = Math.max(0, stat.size - Number(match[2]))
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1))
  const body = request.method === 'HEAD' || !stat.size ? null : Readable.toWeb(fs.createReadStream(file, { start, end }))
  return new Response(body, { status: range ? 206 : 200, headers })
}

module.exports = { MediaLibrary, fileResponse, extensions, mimeTypes }
