const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { fileResponse, mimeTypes } = require('./media-library.cjs')
const MAX_TEXT = 8 * 1024 * 1024
const configPattern = /(?:^|[,{])\s*["']?(?:sites|urls|lives)["']?\s*:/m
const contained = (root, file) => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) }

class LocalTVBoxFiles {
  constructor(userData) {
    this.file = path.join(userData, 'tvbox-local-folders.json')
    this.folders = new Map()
    try { for (const [id, root] of Object.entries(JSON.parse(fs.readFileSync(this.file, 'utf8')))) if (/^[a-f0-9]{32}$/.test(id) && typeof root === 'string' && path.isAbsolute(root)) this.folders.set(id, root) } catch {}
    this.token = crypto.randomBytes(16).toString('hex')
  }
  async start() {
    if (this.starting) return this.starting
    this.starting = new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.serve(req, res))
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => { this.port = this.server.address().port; this.server.unref(); resolve() })
    }).catch(error => { this.starting = null; throw error })
    return this.starting
  }
  async root(id) {
    const saved = this.folders.get(id)
    if (!saved) throw new Error('请重新选择本地配置文件夹')
    let real
    try { real = await fs.promises.realpath(saved) } catch { throw new Error('本地配置文件夹不可用，请重新选择') }
    const normalize = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value)
    if (normalize(real) !== normalize(saved) || !(await fs.promises.stat(real)).isDirectory()) throw new Error('本地配置文件夹已移动，请重新选择')
    return real
  }
  async add(directory) {
    const root = await fs.promises.realpath(directory)
    if (!(await fs.promises.stat(root)).isDirectory()) throw new Error('请选择配置所在文件夹')
    const id = crypto.createHash('sha256').update(process.platform === 'win32' ? root.toLowerCase() : root).digest('hex').slice(0, 32)
    this.folders.set(id, root)
    const result = await this.describe(id)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(Object.fromEntries(this.folders)))
    fs.renameSync(this.file + '.tmp', this.file)
    return result
  }
  async describe(id) {
    if (!/^[a-f0-9]{32}$/.test(id || '')) throw new Error('本地文件夹标识无效')
    const root = await this.root(id)
    await this.start()
    const candidates = []; let scanned = 0, total = 0
    const walk = async (directory, relative = '', depth = 0) => {
      for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
        if (++scanned > 4000) throw new Error('文件夹内容过多，请选择更具体的配置目录')
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
        const file = path.join(directory, entry.name), name = relative + entry.name
        if (entry.isDirectory()) { if (depth < 3) await walk(file, name + '/', depth + 1); continue }
        if (!entry.isFile() || !/\.(json5?|txt|conf)$/i.test(entry.name)) continue
        const real = await fs.promises.realpath(file)
        if (!contained(root, real) || (await fs.promises.stat(real)).size > MAX_TEXT) continue
        const body = await fs.promises.readFile(real, 'utf8')
        if (!configPattern.test(body)) continue
        total += Buffer.byteLength(body)
        if (candidates.length >= 64 || total > 32 * 1024 * 1024) throw new Error('主配置过多或过大，请选择更具体的文件夹')
        candidates.push({ path: name })
      }
    }
    await walk(root)
    if (!candidates.length) throw new Error('目录中没有找到包含 sites、urls 或 lives 的 JSON/TXT 主配置')
    candidates.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true }))
    return { id, name: path.basename(root) || root, baseUrl: `http://127.0.0.1:${this.port}/local/${this.token}/${id}/`, candidates }
  }
  async serve(req, res) {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return }
      const match = /^\/local\/([a-f0-9]{32})\/([a-f0-9]{32})\/(.*)$/.exec(req.url.split('?')[0])
      if (!match || !crypto.timingSafeEqual(Buffer.from(match[1]), Buffer.from(this.token))) { res.writeHead(403).end(); return }
      const parts = match[3].split('/').map(decodeURIComponent)
      if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || /[\\/\0]/.test(part))) { res.writeHead(400).end(); return }
      const root = await this.root(match[2]), file = await fs.promises.realpath(path.join(root, ...parts))
      if (!contained(root, file) || !(await fs.promises.stat(file)).isFile()) { res.writeHead(403).end(); return }
      const type = { '.json': 'application/json; charset=utf-8', '.json5': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.conf': 'text/plain; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.jar': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', ...mimeTypes }[path.extname(file).toLowerCase()] || 'application/octet-stream'
      const response = await fileResponse(new Request(`http://127.0.0.1:${this.port}${req.url}`, { method: req.method, headers: req.headers }), file, type)
      res.writeHead(response.status, { ...Object.fromEntries(response.headers), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
      if (response.body) { const stream = Readable.fromWeb(response.body); res.on('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res) } else res.end()
    } catch { if (res.headersSent) res.destroy(); else res.writeHead(404).end('Local resource unavailable') }
  }
  close() { this.server?.closeAllConnections(); this.server?.close() }
}
module.exports = { LocalTVBoxFiles }
