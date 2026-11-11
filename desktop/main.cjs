const startupEnteredAt = Date.now()
const { app, BrowserWindow, protocol, ipcMain, dialog, session, Menu, shell, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { MediaLibrary, fileResponse, extensions, mimeTypes } = require('./media-library.cjs')
const tvbox = require('./tvbox-network.cjs')
const { AppUpdate } = require('./app-update.cjs')
const { LocalTVBoxFiles } = require('./tvbox-local-files.cjs')

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
  { scheme: 'tvboxmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])
app.setName('本地影库')
app.setAppUserModelId('com.localvideo.desktop')
let mainWindow
let appUpdater
let localTVBoxFiles
let vlcPlayer
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } })
  app.whenReady().then(async () => {
    startupMarks.appReady = Date.now()
    const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, 'web')
    const library = new MediaLibrary(path.join(app.getPath('userData'), 'media-files.json'))
    localTVBoxFiles = new LocalTVBoxFiles(app.getPath('userData'))
    appUpdater = new AppUpdate({ userData: app.getPath('userData'), version: app.getVersion(), secureStorage: safeStorage, openInstaller: file => shell.openPath(file), notify: progress => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:progress', progress) } })
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
    protocol.handle('tvboxmedia', request => tvbox.mediaResponse(request))
    // All access originates from the bundled main frame; paths are never accepted in URLs.
    const trusted = (event) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return false
      const url = new URL(event.senderFrame.url)
      return url.protocol === 'localvideo:' && url.hostname === 'app'
    }
    let importing = false
    ipcMain.handle('vlc:open', async (event, input) => {
      if (!trusted(event) || !input || typeof input.src !== 'string' || input.src.length > 30000 || !Number.isSafeInteger(input.generation)) throw new Error('Invalid playback request')
      if (!vlcPlayer || vlcPlayer.closed) {
        const { VlcPlayer } = require('./vlc-player.cjs')
        vlcPlayer = new VlcPlayer({ owner: mainWindow, library })
      }
      const currentPlayer=vlcPlayer
      try { return await currentPlayer.open(input) } catch (error) { await currentPlayer.close(); throw error }
    })
    ipcMain.handle('vlc:command', (event, action, input = {}) => {
      if (!trusted(event)) throw new Error('Invalid sender')
      if (action === 'close') return vlcPlayer?.close()
      if (action === 'focus') { vlcPlayer?.focus(); return true }
      if (action === 'visible') { vlcPlayer?.setVisible(!!input.value); return true }
      if (action === 'fullscreen') { vlcPlayer?.window?.setFullScreen(!!input.value); return true }
      if (action === 'fit') { if (vlcPlayer && !vlcPlayer.closed) { vlcPlayer.fill = !!input.fill; vlcPlayer.align?.() } return true }
      if (!['play','pause','seek','rate','volume'].includes(action)) throw new Error('Invalid player command')
      if (!vlcPlayer || vlcPlayer.closed) return false
      return vlcPlayer.command(action, input)
    })
    ipcMain.handle('update:config', event => { if (!trusted(event)) throw new Error('Invalid sender'); return appUpdater.publicConfig() })
    ipcMain.handle('update:save', (event, input) => { if (!trusted(event) || !input || typeof input !== 'object') throw new Error('Invalid request'); return appUpdater.saveConfig(input) })
    ipcMain.handle('update:check', event => { if (!trusted(event)) throw new Error('Invalid sender'); return appUpdater.check() })
    ipcMain.handle('update:download', event => { if (!trusted(event)) throw new Error('Invalid sender'); return appUpdater.download() })
    ipcMain.handle('update:install', async event => { if (!trusted(event)) throw new Error('Invalid sender'); const result = await appUpdater.install(); setTimeout(() => app.quit(), 300); return result })
    ipcMain.handle('tvbox:request', (event, input) => {
      if (!trusted(event) || !input || typeof input.url !== 'string') throw new Error('Invalid request')
      return tvbox.requestText(input.url, input.headers, !!input.allowLocal)
    })
    ipcMain.handle('tvbox:pick-folder', async event => {
      if (!trusted(event)) throw new Error('Invalid sender')
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择 TVBox 配置文件夹（包含 JAR 和规则文件）', properties: ['openDirectory'] })
      return result.canceled ? null : localTVBoxFiles.add(result.filePaths[0])
    })
    ipcMain.handle('tvbox:restore-folder', (event, id) => {
      if (!trusted(event) || typeof id !== 'string') throw new Error('Invalid request')
      return localTVBoxFiles.describe(id)
    })
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
    mainWindow.on('closed', () => { vlcPlayer?.close(); mainWindow = null })
    mainWindow.on('close',event=>{ if(vlcPlayer && !vlcPlayer.closed){event.preventDefault();vlcPlayer.close().finally(()=>mainWindow?.close())} })
    mainWindow.loadURL('localvideo://app/')
  }).catch((error) => { dialog.showErrorBox('本地影库启动失败', error.message); app.quit() })
}
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => localTVBoxFiles?.close())
