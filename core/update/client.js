import { reactive } from 'vue'
import appManifest from '../../manifest.json'
import { readRelease, DEFAULT_UPDATE_URL } from './model.mjs'
import { UniversalURL } from '../tvbox/vendor.mjs'
import { androidUpdateConfig, androidUpdateTask } from './android.js'
import { saveState } from '../store.js'

function desktop() {
  // #ifdef H5
  return typeof window !== 'undefined' ? window.localVideoDesktop : null
  // #endif
  // #ifndef H5
  return null
  // #endif
}
function platform() {
  if (desktop()?.updateConfig) return 'windows'
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') return 'android'
  // #endif
  return ''
}
export const updateState = reactive({ supported: false, currentVersion: appManifest.versionName, config: { manifestUrl: DEFAULT_UPDATE_URL, autoCheck: true, configured: true, downloadMode: 'auto', mirrorUrl: '' }, phase: '', release: null, downloaded: false, received: 0, total: 0, error: '', message: '', checkedAt: 0 })
export async function loadUpdateConfig() {
  const target = platform(); updateState.supported = !!target
  if (!target) return updateState.config
  const config = target === 'windows' ? await desktop().updateConfig() : androidUpdateConfig()
  updateState.config = { ...updateState.config, ...config }
  updateState.currentVersion = target === 'windows' ? config.currentVersion : config.installedVersion || appManifest.versionName
  return updateState.config
}
export async function saveUpdateConfig(config) {
  if (updateState.phase) throw new Error('更新操作进行中，请稍候')
  const target = platform(); if (!target) throw new Error('请在 Windows 桌面版或 Android App 中配置更新')
  const result = target === 'windows' ? await desktop().saveUpdateConfig(config) : androidUpdateConfig(config)
  updateState.config = { ...updateState.config, ...result }; updateState.release = null; updateState.downloaded = false; updateState.error = ''; updateState.message = '更新设置已保存，更新来源为 GitHub Releases'
  return result
}
export async function checkForUpdates(automatic = false) {
  if (updateState.phase) return
  try {
    await loadUpdateConfig()
    if (!updateState.supported || automatic && !updateState.config.autoCheck) return
    updateState.phase = 'checking'; updateState.error = ''; updateState.message = ''
    const result = platform() === 'windows' ? await desktop().checkUpdate() : { release: readRelease(await androidUpdateTask('check'), 'android', updateState.currentVersion, UniversalURL), checkedAt: Date.now() }
    updateState.checkedAt = result.checkedAt; updateState.release = result.release?.available ? result.release : null; updateState.downloaded = false
    updateState.message = !result.release ? 'GitHub 尚未发布此平台版本' : updateState.release ? `发现新版本 ${result.release.version}` : '当前已是最新版本'
    if (automatic && updateState.release) {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      if (pages[pages.length - 1]?.route?.includes('player')) uni.showToast({ title: '发现新版本，可到设置中更新', icon: 'none' })
      else uni.showModal({ title: '发现新版本', content: `本地影库 ${result.release.version} 已发布，是否前往设置查看更新？`, confirmText: '查看更新', success: result => { if (result.confirm) uni.reLaunch({ url: '/pages/home/home?tab=settings' }) } })
    }
  } catch (error) { updateState.error = error.message || '检查更新失败'; if (!automatic) throw error }
  finally { updateState.phase = '' }
}
export async function downloadUpdate() {
  if (updateState.phase || !updateState.release) return
  updateState.phase = 'downloading'; updateState.error = ''; updateState.received = 0; updateState.total = updateState.release.size; updateState.downloaded = false
  let unsubscribe
  const progress = value => { updateState.received = value.received || 0; updateState.total = value.total || updateState.release.size }
  try {
    if (platform() === 'windows') { unsubscribe = desktop().onUpdateProgress(progress); await desktop().downloadUpdate() }
    else await androidUpdateTask('download', updateState.release, progress)
    updateState.downloaded = true; updateState.received = updateState.total; updateState.message = '安装包已下载并通过校验，可以安装'
  } catch (error) { updateState.error = error.message || '更新下载失败'; throw error }
  finally { unsubscribe?.(); updateState.phase = '' }
}
export async function installUpdate() {
  if (updateState.phase || !updateState.downloaded) return
  updateState.phase = 'installing'; updateState.error = ''; saveState({ immediate: true })
  try {
    if (platform() === 'windows') await desktop().installUpdate()
    else {
      const file = await androidUpdateTask('installPath')
      await new Promise((resolve, reject) => plus.runtime.install(file, { force: false }, resolve, error => reject(new Error(error.message || '系统未完成安装'))))
    }
  } catch (error) { updateState.error = error.message || '无法打开安装器'; throw error }
  finally { updateState.phase = '' }
}
