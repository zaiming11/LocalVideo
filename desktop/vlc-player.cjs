const { BrowserWindow, ipcMain, app } = require('electron')
const { Worker } = require('node:worker_threads')
const { randomBytes } = require('node:crypto')
const { Readable } = require('node:stream')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const tvbox = require('./tvbox-network.cjs')
const { EmbeddedVlcSurface } = require('./vlc-embedding.cjs')

class VlcPlayer {
  constructor({ owner, library }) {
    this.owner = owner; this.library = library; this.pending = new Map(); this.serial = 0
    this.fill = false; this.volume = 1; this.muted = false; this.rate = 1; this.generation = 0; this.closed = false
    this.notify = data => { if (!owner.isDestroyed()) owner.webContents.send('vlc:event', data) }
    this.hudHandler = async (event, action, input = {}) => {
      if (!this.hud || event.sender !== this.hud.webContents || event.senderFrame !== this.hud.webContents.mainFrame) throw new Error('Invalid player sender')
      if (['next', 'previous'].includes(action)) { this.notify({ type: action }); return }
      if (action === 'back') { this.notify({type:'back'}); return }
      if (action === 'select') { if (this.queue?.some(item=>item.id===input.id)) this.notify({type:'select',id:input.id}); return }
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
    // Worker process.env is a JS copy. Native getenv must see the plugin path
    // before the DLL is loaded, including when running inside an installed ASAR.
    process.env.VLC_PLUGIN_PATH=path.join(runtime,'plugins')
    this.window = this.owner
    this.surface = new EmbeddedVlcSurface(this.owner)
    this.hud = new BrowserWindow({ parent: this.window, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, skipTaskbar: true, show: false, resizable: false, fullscreenable: false, minimizable: false, maximizable: false, webPreferences: { preload: path.join(__dirname,'vlc-preload.cjs'), sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
    this.hud.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.hud.webContents.on('will-navigate', event => event.preventDefault())
    ipcMain.handle('vlc:hud', this.hudHandler)
    this.hudReady = this.hud.loadFile(path.join(__dirname, 'vlc-controls.html'))
    this.hudReady.catch(()=>{})
    this.align = () => {
      if (!this.window || this.window.isDestroyed() || !this.hud || this.hud.isDestroyed()) return
      const bounds = this.surface.align()
      if (this.initialized && bounds) this.send('fit', { fill: this.fill, width: bounds.width, height: bounds.height })
      this.hud.webContents.send('vlc:state', this.hudState())
    }
    for (const event of ['move','resize','enter-full-screen','leave-full-screen']) this.window.on(event, this.align)
    this.onRestore=()=>{ if (this.visible) {this.align(); this.surface.visible(true)} }
    this.window.on('restore',this.onRestore)
    this.worker = new Worker(path.join(__dirname, 'vlc-worker.cjs'), { workerData: { runtime, hwnd: this.surface.handle(), logFile:path.join(app.getPath('userData'),'vlc-playback.log') } })
    await new Promise((resolve, reject) => {
      const startup = setTimeout(() => reject(new Error('LibVLC 加载超时')), 30000)
      this.worker.on('message', message => {
        if (message.type === 'ready') { clearTimeout(startup); resolve(); return }
        if (message.type === 'fatal') { this.workerFailed = true; clearTimeout(startup); reject(new Error(message.error)); return }
        if (message.type === 'state') {
          if (message.generation !== this.generation || this.closed) return
          this.state = message; this.notify({ ...message, volume: this.volume, muted: this.muted, rate: this.rate, fill: this.fill })
          this.hud?.webContents.send('vlc:state', this.hudState())
        } else if (message.id) {
          const pending = this.pending.get(message.id); this.pending.delete(message.id)
          if (pending) { clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result) }
        }
      })
      this.worker.on('error', error => { this.workerFailed = true; clearTimeout(startup); reject(error); this.fail(error) })
      this.worker.on('exit', code => { if (code && !this.closed) this.fail(new Error('LibVLC 播放进程退出')); for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('播放器已关闭')) } this.pending.clear() })
    })
    await this.hudReady
    if (this.closed) throw new Error('播放器已关闭')
    this.surface.attachHud(this.hud)
    this.initialized = true
  }
  hudState() { return {...this.state,title:this.title,fullscreen:this.owner.isFullScreen(),fill:this.fill,volume:this.volume,muted:this.muted,rate:this.rate,currentId:this.currentId,live:this.live} }
  setVisible(value) { this.visible=!!value; this.surface?.visible(this.visible) }
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
    this.queue=Array.isArray(input.queue) ? input.queue.slice(0,10000).filter(item=>item && typeof item.id==='string' && typeof item.title==='string').map(item=>({id:item.id,title:item.title.slice(0,300)})) : []
    this.currentId=typeof input.currentId==='string' ? input.currentId : ''
    this.live=!!input.live
    this.hud.webContents.send('vlc:state',{queue:this.queue,currentId:this.currentId,title:this.title,live:this.live,currentTime:0,duration:0,paused:true,events:[],error:''})
    let source
    if (input.src.startsWith('localmedia://')) {
      const file = this.library.resolve(input.src)
      if (!file) throw new Error('原视频文件不存在，请重新导入')
      source = { file }
    } else if (input.src.startsWith('tvboxmedia://stream/')) {
      const prefix = await this.proxy(),decoded=tvbox.decodeMediaUrl(input.src); source = { url: tvbox.mediaUrl(decoded.url,decoded.headers,decoded.allowLocal,prefix) }
    } else if (/^https?:\/\//i.test(input.src)) {
      const prefix = await this.proxy(); source = { url: tvbox.mediaUrl(input.src, {}, false, prefix) }
    } else throw new Error('不支持的视频地址，请重新导入文件')
    if (ticket !== this.openTicket || this.closed) return false
    await this.command('open',{ ...source, generation: this.generation, volume:this.volume, muted:this.muted, rate:this.rate,live:this.live })
    if (ticket !== this.openTicket || this.closed) return false
    this.setVisible(true); this.align(); this.owner.focus(); this.hud.focus();this.hud.webContents.focus()
    return true
  }
  focus() { if (!this.owner.isDestroyed()) { if(this.owner.isMinimized())this.owner.restore(); this.setVisible(true); this.owner.focus(); this.hud?.focus();this.hud?.webContents.focus() } }
  fail(error) { this.notify({ type:'error', error:error.message }) }
  async close(returnToLibrary = false) {
    if (this.closed) return
    this.closed = true; ipcMain.removeHandler('vlc:hud')
    if(!this.owner.isDestroyed()&&this.owner.isFullScreen())this.owner.setFullScreen(false)
    this.notify({ type:'closed' })
    this.setVisible(false)
    if(this.align)for (const event of ['move','resize','enter-full-screen','leave-full-screen']) this.owner.removeListener(event,this.align)
    if(this.onRestore)this.owner.removeListener('restore',this.onRestore)
    this.hud?.destroy(); this.hud = null
    if (returnToLibrary && !this.owner.isDestroyed()) { this.owner.show(); this.owner.focus() }
    if (this.worker) { if (!this.workerFailed && this.initialized) { try { await this.command('close') } catch {} } await this.worker.terminate(); this.worker = null }
    this.surface?.destroy(); this.surface=null; this.window = null
    this.server?.closeAllConnections(); this.server?.close(); this.server = null
  }
}
module.exports = { VlcPlayer }
