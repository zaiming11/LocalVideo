const { BrowserWindow, ipcMain, app } = require('electron')
const { Worker } = require('node:worker_threads')
const { randomBytes } = require('node:crypto')
const { Readable } = require('node:stream')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const tvbox = require('./tvbox-network.cjs')

class VlcPlayer {
  constructor({ owner, library }) {
    this.owner = owner; this.library = library; this.pending = new Map(); this.serial = 0
    this.fill = false; this.volume = 1; this.muted = false; this.rate = 1; this.generation = 0; this.closed = false
    this.notify = data => { if (!owner.isDestroyed()) owner.webContents.send('vlc:event', data) }
    this.hudHandler = async (event, action, input = {}) => {
      if (!this.hud || event.sender !== this.hud.webContents || event.senderFrame !== this.hud.webContents.mainFrame) throw new Error('Invalid player sender')
      if (['next', 'previous'].includes(action)) { this.notify({ type: action }); return }
      if (action === 'close') { this.close(); return }
      if (action === 'fullscreen') { this.window.setFullScreen(!!input.value); return }
      if (action === 'fit') { this.fill = !!input.fill; this.align(); return }
      if (!['play','pause','seek','rate','volume'].includes(action)) throw new Error('Invalid playback action')
      if (action === 'volume') { this.volume = Math.max(0,Math.min(1,Number(input.value))); this.muted = !!input.muted }
      return this.command(action, input)
    }
  }
  async proxy() {
    if (this.proxyReady) return this.proxyReady
    this.proxyReady = this.startProxy()
    return this.proxyReady
  }
  async startProxy() {
    this.token = randomBytes(24).toString('hex')
    this.server = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/' + this.token + '/') || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return }
      const controller = new AbortController()
      res.on('close', () => controller.abort())
      try {
        const response = await tvbox.mediaResponse(new Request(this.prefix + req.url.slice(this.token.length + 2), { method: req.method, headers: req.headers, signal: controller.signal }), this.prefix)
        res.writeHead(response.status, Object.fromEntries(response.headers))
        if (!response.body) { res.end(); return }
        const stream = Readable.fromWeb(response.body)
        stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res)
      } catch { if (!res.headersSent) res.writeHead(502); res.end() }
    })
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve) })
    this.prefix = `http://127.0.0.1:${this.server.address().port}/${this.token}/`
    return this.prefix
  }
  async initialize() {
    const runtime = app.isPackaged ? path.join(process.resourcesPath, 'vlc-runtime') : path.join(__dirname, 'vlc-runtime')
    if (!fs.existsSync(path.join(runtime, 'libvlc.dll'))) throw new Error('缺少内置 LibVLC，请运行 node tools/prepare-vlc.cjs --windows 后重新打包')
    this.window = new BrowserWindow({ width: 1100, height: 720, minWidth: 480, minHeight: 320, backgroundColor: '#000000', title: 'LibVLC · 本地影库', show: false, icon: path.join(__dirname,'assets/icon.ico'), webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    this.window.setMenuBarVisibility(false)
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.window.webContents.on('will-navigate', event => event.preventDefault())
    await this.window.loadURL('about:blank')
    if (this.closed) throw new Error('播放器已关闭')
    this.hud = new BrowserWindow({ parent: this.window, frame: false, transparent: true, hasShadow: false, skipTaskbar: true, show: false, resizable: false, webPreferences: { preload: path.join(__dirname,'vlc-preload.cjs'), sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
    this.hud.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.hud.webContents.on('will-navigate', event => event.preventDefault())
    ipcMain.handle('vlc:hud', this.hudHandler)
    this.hudReady = this.hud.loadFile(path.join(__dirname, 'vlc-controls.html'))
    this.align = () => {
      if (!this.window || this.window.isDestroyed() || !this.hud || this.hud.isDestroyed()) return
      const bounds = this.window.getContentBounds(); this.hud.setBounds(bounds)
      if (this.initialized) this.send('fit', { fill: this.fill, width: bounds.width, height: bounds.height })
      this.hud.webContents.send('vlc:state', { ...this.state, fullscreen: this.window.isFullScreen(), fill: this.fill, volume: this.volume, muted: this.muted, rate: this.rate, title: this.title })
    }
    for (const event of ['move','resize','enter-full-screen','leave-full-screen']) this.window.on(event, this.align)
    this.window.on('minimize', () => this.hud.hide())
    this.window.on('restore', () => { this.align(); this.hud.show() })
    this.window.on('close', event => { if (!this.closed) { event.preventDefault(); this.close(true) } })
    this.window.on('closed', () => { this.window = null })
    this.worker = new Worker(path.join(__dirname, 'vlc-worker.cjs'), { workerData: { runtime, hwnd: this.window.getNativeWindowHandle() } })
    await new Promise((resolve, reject) => {
      const startup = setTimeout(() => reject(new Error('LibVLC 加载超时')), 30000)
      this.worker.on('message', message => {
        if (message.type === 'ready') { clearTimeout(startup); resolve(); return }
        if (message.type === 'fatal') { this.workerFailed = true; clearTimeout(startup); reject(new Error(message.error)); return }
        if (message.type === 'state') {
          if (message.generation !== this.generation || this.closed) return
          this.state = message; this.notify({ ...message, volume: this.volume, muted: this.muted, rate: this.rate, fill: this.fill })
          this.hud?.webContents.send('vlc:state', { ...message, title: this.title, fullscreen: this.window?.isFullScreen(), fill: this.fill, volume: this.volume, muted: this.muted, rate: this.rate })
        } else if (message.id) {
          const pending = this.pending.get(message.id); this.pending.delete(message.id)
          if (pending) { clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result) }
        }
      })
      this.worker.on('error', error => { this.workerFailed = true; clearTimeout(startup); reject(error); this.fail(error) })
      this.worker.on('exit', code => { if (code && !this.closed) this.fail(new Error('LibVLC 播放进程退出')); for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('播放器已关闭')) } this.pending.clear() })
    })
    await this.hudReady
    this.initialized = true
  }
  send(action, input) { return this.command(action,input).catch(error => { if (!this.closed) this.fail(error) }) }
  command(action, input = {}) {
    if (!this.worker || this.closed && action !== 'close') return Promise.reject(new Error('播放器未启动'))
    if (!['open','play','pause','seek','rate','volume','fit','close'].includes(action)) return Promise.reject(new Error('不支持的播放操作'))
    if (['seek','rate','volume'].includes(action)) {
      if (!Number.isFinite(input.value)) return Promise.reject(new Error('播放参数无效'))
      input = { ...input, value: action === 'rate' ? Math.max(0.25,Math.min(4,input.value)) : action === 'volume' ? Math.max(0,Math.min(1,input.value)) : Math.max(0,input.value) }
      if (action === 'rate') this.rate = input.value
      if (action === 'volume') { this.volume = input.value; this.muted = !!input.muted }
    }
    const id = ++this.serial
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('播放器响应超时')) }, 30000)
      this.pending.set(id,{ resolve,reject,timer }); this.worker.postMessage({ id,action,input })
    })
  }
  async open(input) {
    const ticket = (this.openTicket || 0) + 1; this.openTicket = ticket
    if (!this.ready) this.ready = this.initialize()
    await this.ready
    if (this.closed) throw new Error('播放器已关闭')
    if (ticket !== this.openTicket) return false
    this.generation = input.generation; this.title = String(input.title || '本地影库').slice(0,200); this.fill = !!input.fill
    this.volume = Number.isFinite(input.volume) ? Math.max(0,Math.min(1,input.volume)) : 1
    this.rate = Number.isFinite(input.rate) ? Math.max(.25,Math.min(4,input.rate)) : 1
    this.muted = !!input.muted
    let source
    if (input.src.startsWith('localmedia://')) {
      const file = this.library.resolve(input.src)
      if (!file) throw new Error('原视频文件不存在，请重新导入')
      source = { file }
    } else if (input.src.startsWith('tvboxmedia://stream/')) {
      const prefix = await this.proxy(); source = { url: prefix + new URL(input.src).pathname.slice(1) }
    } else if (/^https?:\/\//i.test(input.src)) {
      const prefix = await this.proxy(); source = { url: tvbox.mediaUrl(input.src, {}, false, prefix) }
    } else throw new Error('不支持的视频地址，请重新导入文件')
    if (ticket !== this.openTicket || this.closed) return false
    this.window.setTitle(this.title + ' · LibVLC')
    await this.command('open',{ ...source, generation: this.generation, volume:this.volume, muted:this.muted, rate:this.rate })
    if (ticket !== this.openTicket || this.closed) return false
    this.window.show(); this.align(); this.hud.show(); this.hud.focus()
    return true
  }
  focus() { if (this.window && !this.window.isDestroyed()) { this.window.restore(); this.window.show(); this.hud?.show(); this.hud?.focus() } }
  fail(error) { this.notify({ type:'error', error:error.message }) }
  async close(returnToLibrary = false) {
    if (this.closed) return
    this.closed = true; ipcMain.removeHandler('vlc:hud')
    this.notify({ type:'closed' })
    this.hud?.destroy(); this.hud = null
    this.window?.hide()
    if (returnToLibrary && !this.owner.isDestroyed()) { this.owner.show(); this.owner.focus() }
    if (this.worker) { if (!this.workerFailed && this.initialized) { try { await this.command('close') } catch {} } await this.worker.terminate(); this.worker = null }
    this.window?.destroy(); this.window = null
    this.server?.closeAllConnections(); this.server?.close(); this.server = null
  }
}
module.exports = { VlcPlayer }
