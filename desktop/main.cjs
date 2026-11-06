const startupEnteredAt = Date.now()
const { app, BrowserWindow, protocol, ipcMain, dialog, session, Menu } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { MediaLibrary, fileResponse, extensions, mimeTypes } = require('./media-library.cjs')
const { handleRemoteRequest, fetchBuffer, buildProxyUrl, ProxyError, MAX_TEXT_BYTES } = require('./remote-proxy.cjs')

// Opt-in startup measurement uses its own profile and never opens the user's library.
const measureStartup = process.argv.includes('--measure-startup') && process.env.LOCALVIDEO_STARTUP_REPORT && process.env.LOCALVIDEO_STARTUP_PROFILE
const startupMarks = { mainEntered: startupEnteredAt }
if (measureStartup) {
  fs.mkdirSync(process.env.LOCALVIDEO_STARTUP_PROFILE, { recursive: true })
  app.setPath('userData', process.env.LOCALVIDEO_STARTUP_PROFILE)
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'localvideo', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'localmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  // Online sources need both CORS (for fetch from the app frame) and stream
  // (so <video> can seek a proxied segment without buffering it whole).
  { scheme: 'remotemedia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])
app.setName('本地影库')
app.setAppUserModelId('com.localvideo.desktop')
let mainWindow
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } })
  app.whenReady().then(() => {
    startupMarks.appReady = Date.now()
    const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, 'web')
    const library = new MediaLibrary(path.join(app.getPath('userData'), 'media-files.json'))
    protocol.handle('localvideo', async (request) => {
      const url = new URL(request.url)
      if (url.hostname !== 'app') return new Response(null, { status: 403 })
      let pathname
      try { pathname = decodeURIComponent(url.pathname) } catch { return new Response(null, { status: 400 }) }
      const file = path.resolve(webRoot, '.' + (pathname === '/' ? '/index.html' : pathname))
      const relative = path.relative(webRoot, file)
      if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response(null, { status: 403 })
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', ...mimeTypes }[path.extname(file)] || 'application/octet-stream'
      return fileResponse(request, file, type)
    })
    protocol.handle('localmedia', async (request) => {
      const file = library.resolve(request.url)
      return file ? fileResponse(request, file, mimeTypes[path.extname(file).toLowerCase()] || 'video/mp4') : new Response(null, { status: 404 })
    })
    // Remote playback and artwork. The renderer never talks to a media host
    // directly; every request lands here, gets its address re-validated, and is
    // forwarded only when it resolves to a public host.
    protocol.handle('remotemedia', async (request) => {
      let result
      try {
        result = await handleRemoteRequest(request, { toProxyUrl: toRemoteProxyUrl })
      } catch (error) {
        return new Response(error?.message || '代理请求失败', {
          status: error instanceof ProxyError && error.code === 'BLOCKED' ? 403 : 502,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      }
      // Same-origin convention as fileResponse(): only the bundled app frame may
      // read a proxied body.
      const headers = new Headers({ 'Access-Control-Allow-Origin': 'localvideo://app' })
      for (const [key, value] of Object.entries(result.headers || {})) headers.set(key, String(value))
      const body = result.body == null || result.body.length === 0 || Buffer.isBuffer(result.body)
        ? result.body
        : Readable.toWeb(result.body)
      return new Response(body, { status: result.status, headers })
    })
    // All access originates from the bundled main frame; paths are never accepted in URLs.
    const trusted = (event) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return false
      const url = new URL(event.senderFrame.url)
      return url.protocol === 'localvideo:' && url.hostname === 'app'
    }
    let importing = false
    const add = async (files) => {
      if (importing) throw new Error('正在导入，请稍候')
      importing = true
      try { return await library.addPaths(files) } finally { importing = false }
    }
    ipcMain.handle('media:pick-files', async (event) => {
      if (!trusted(event)) throw new Error('Invalid sender')
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择视频文件', properties: ['openFile', 'multiSelections'], filters: [{ name: '视频文件', extensions }] })
      return result.canceled ? [] : (await add(result.filePaths)).map((entry) => entry.file)
    })
    ipcMain.handle('media:pick-directory', async (event) => {
      if (!trusted(event)) throw new Error('Invalid sender')
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择视频文件夹（包含子文件夹）', properties: ['openDirectory'] })
      return result.canceled ? [] : add(result.filePaths)
    })
    ipcMain.handle('media:drop', async (event, files) => {
      if (!trusted(event) || !Array.isArray(files) || files.some((file) => typeof file !== 'string')) throw new Error('Invalid files')
      return add(files)
    })
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(contents === mainWindow?.webContents && permission === 'fullscreen')
    })
    Menu.setApplicationMenu(null)
    mainWindow = new BrowserWindow({
      width: 1280, height: 850, minWidth: 900, minHeight: 620,
      title: '本地影库', backgroundColor: '#0A0D0A', show: false,
      icon: path.join(__dirname, 'assets/icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    })
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('localvideo://app/')) event.preventDefault() })
    mainWindow.once('ready-to-show', () => {
      startupMarks.readyToShow = Date.now()
      if (measureStartup) {
        fs.writeFileSync(process.env.LOCALVIDEO_STARTUP_REPORT, JSON.stringify({
          version: app.getVersion(),
          ...startupMarks,
          launchToReadyMs: startupMarks.readyToShow - Number(process.env.LOCALVIDEO_STARTUP_STARTED_AT || startupEnteredAt),
          mainToReadyMs: startupMarks.readyToShow - startupEnteredAt
        }, null, 2))
        app.quit()
      } else mainWindow.show()
    })
    mainWindow.on('closed', () => { mainWindow = null })
    mainWindow.loadURL('localvideo://app/')
  }).catch((error) => { dialog.showErrorBox('本地影库启动失败', error.message); app.quit() })
}
app.on('window-all-closed', () => app.quit())
