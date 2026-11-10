const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const tls = require('node:tls')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const DEFAULT_URL = 'https://github.com/zaiming11/LocalVideo/releases/latest/download/version.json'
const modelPath = __dirname.includes('app.asar') ? path.join(__dirname, 'update-model.mjs') : path.join(__dirname, '../core/update/model.mjs')
const model = () => import(pathToFileURL(modelPath).href)
const trustedCAs = tls.getCACertificates ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : undefined

function normalizeConfig(input = {}) {
  const downloadMode = ['auto', 'direct', 'custom'].includes(input.downloadMode) ? input.downloadMode : 'auto'
  let mirrorUrl = String(input.mirrorUrl || '').trim()
  if (mirrorUrl) {
    const url = new URL(mirrorUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.includes('https:')) throw new Error('镜像地址须为不含账号密码、参数的 HTTPS 前缀')
    mirrorUrl = url.href.replace(/\/*$/, '/')
  }
  if (downloadMode === 'custom' && !mirrorUrl) throw new Error('请填写镜像地址')
  return { manifestUrl: DEFAULT_URL, autoCheck: input.autoCheck !== false, downloadMode, mirrorUrl }
}
function open(url, config, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return reject(new Error('更新下载只允许 HTTPS'))
    const headers = { 'User-Agent': 'LocalVideo-Updater/1', 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity' }
    const request = https.get(parsed, { headers, ...(trustedCAs ? { ca: trustedCAs } : {}) }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.destroy(); if (redirects >= 5) return reject(new Error('更新地址重定向次数过多'))
        const target = new URL(response.headers.location, parsed)
        open(target.href, config, redirects + 1).then(resolve, reject); return
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy(); return reject(new Error(response.statusCode === 404 ? 'GitHub 尚未发布版本文件或安装包' : response.statusCode === 403 || response.statusCode === 429 ? 'GitHub 暂时限制请求，请稍后重试' : 'GitHub 更新服务器返回 HTTP ' + response.statusCode))
      }
      resolve(response)
    })
    request.setTimeout(30000, () => request.destroy(new Error('更新请求超时，请稍后重试')))
    request.once('error', () => reject(new Error('无法连接更新服务器，请检查网络')))
  })
}
class AppUpdate {
  constructor({ userData, version, secureStorage, openInstaller, notify = () => {}, request = open }) {
    this.userData = userData; this.version = version; this.secureStorage = secureStorage; this.openInstaller = openInstaller; this.notify = notify; this.request = request
    this.configFile = path.join(userData, 'update-source.json'); this.release = null; this.downloaded = null; this.downloading = false; this.generation = 0
  }
  loadConfig() {
    try { return normalizeConfig(JSON.parse(fs.readFileSync(this.configFile, 'utf8'))) } catch {}
    const legacy = path.join(this.userData, 'update-source.encrypted')
    let previous = {}
    if (fs.existsSync(legacy)) {
      try { previous = JSON.parse(this.secureStorage.decryptString(fs.readFileSync(legacy))) } catch {}
      const config = normalizeConfig(previous)
      fs.mkdirSync(this.userData, { recursive: true }); fs.writeFileSync(this.configFile, JSON.stringify(config)); fs.unlinkSync(legacy)
      return config
    }
    return normalizeConfig()
  }
  publicConfig() {
    const config = this.loadConfig()
    return { ...config, configured: true, currentVersion: this.version }
  }
  saveConfig(input) {
    if (this.downloading) throw new Error('下载中不能修改更新来源')
    const config = normalizeConfig(input)
    fs.mkdirSync(this.userData, { recursive: true }); fs.writeFileSync(this.configFile, JSON.stringify(config))
    this.generation++; this.release = null; this.downloaded = null; return this.publicConfig()
  }
  async check() {
    if (this.downloading) throw new Error('正在下载更新')
    const config = this.loadConfig()
    const ticket = ++this.generation
    this.release = null; this.downloaded = null
    const releaseModel = await model()
    let lastError
    for (const url of releaseModel.updateSources(config.manifestUrl, config)) {
      try {
        const response = await this.request(url, config), chunks = []; let size = 0
        for await (const chunk of response) { size += chunk.length; if (size > 1024 * 1024) { response.destroy(); throw new Error('版本管理文件过大') } chunks.push(chunk) }
        const release = releaseModel.readRelease(Buffer.concat(chunks).toString('utf8'), 'windows', this.version)
        if (ticket !== this.generation) throw new Error('更新来源已改变，请重新检查')
        this.release = release?.available ? { ...release, source: config.manifestUrl } : null
        return { currentVersion: this.version, release, checkedAt: Date.now() }
      } catch (error) { if (ticket !== this.generation) throw error; lastError = error }
    }
    throw lastError
  }

  async download() {
    if (this.downloading) throw new Error('正在下载更新')
    const release = this.release, config = this.loadConfig()
    if (!release || !config || config.manifestUrl !== release.source) throw new Error('请先检查新版本')
    this.downloading = true; this.downloaded = null
    try {
      const { updateSources } = await model()
      const routes = updateSources(release.downloadUrl || new URL(release.file, config.manifestUrl).href, config)
      let lastError
      for (let route = 0; route < routes.length; route++) {
        try { return await this.downloadAttempt(release, config, route, updateSources) }
        catch (error) { lastError = error; this.notify({ received: 0, total: release.size }) }
      }
      throw lastError
    } finally { this.downloading = false }
  }
  async downloadAttempt(release, config, route, updateSources) {
    const dir = path.join(this.userData, 'updates'), file = path.join(dir, release.file), partial = file + '.part'
    fs.mkdirSync(dir, { recursive: true })
    let output
    try {
      output = fs.createWriteStream(partial); output.on('error', () => {})
      let received = 0, last = 0; const hash = crypto.createHash('sha256')
      for (const asset of release.chunks || [release]) {
        const url = updateSources(asset.downloadUrl || new URL(asset.file, config.manifestUrl).href, config)[route]
        const response = await this.request(url, config)
        let assetBytes = 0; const assetHash = crypto.createHash('sha256')
        for await (const chunk of response) {
          received += chunk.length; assetBytes += chunk.length
          if (received > release.size || assetBytes > asset.size) { response.destroy(); throw new Error('下载大小与版本文件不一致') }
          hash.update(chunk); assetHash.update(chunk)
          await new Promise((resolve, reject) => output.write(chunk, error => error ? reject(error) : resolve()))
          if (Date.now() - last > 250) { this.notify({ received, total: release.size }); last = Date.now() }
        }
        if (assetBytes !== asset.size || assetHash.digest('hex') !== asset.sha256) throw new Error('安装包或分片校验失败，已阻止安装')
      }
      await new Promise((resolve, reject) => output.end(error => error ? reject(error) : resolve()))
      if (!output.closed) await new Promise(resolve => output.once('close', resolve))
      if (received !== release.size || hash.digest('hex') !== release.sha256) throw new Error('安装包校验失败，已阻止安装，请重新检查更新')
      fs.renameSync(partial, file); this.downloaded = { file, release }; this.notify({ received, total: release.size, complete: true })
      return { version: release.version, complete: true }
    } catch (error) {
      if (output && !output.closed) await new Promise(resolve => { output.once('close', resolve); output.destroy() })
      try { fs.unlinkSync(partial) } catch {}
      throw error
    }
  }

  async install() {
    if (!this.downloaded) throw new Error('请先下载并校验更新')
    const { file, release } = this.downloaded; const hash = crypto.createHash('sha256')
    for await (const part of fs.createReadStream(file)) hash.update(part)
    if (hash.digest('hex') !== release.sha256) throw new Error('安装包校验失败，请重新下载')
    const error = await this.openInstaller(file); if (error) throw new Error('无法启动安装器：' + error)
    return { launched: true }
  }
}
module.exports = { AppUpdate, normalizeConfig, DEFAULT_URL }
