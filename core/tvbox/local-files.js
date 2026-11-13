import { isAndroidTVBox, importAndroidTVBoxFolder, restoreAndroidTVBoxFolder } from './android.js'
import { pickAndroidDirectory } from '../android-directory.js'
import { refreshLocalReferences } from './local-reference.mjs'
// #ifdef H5
import { canImportBrowserTVBoxFolder, pickBrowserTVBoxFolder, restoreBrowserTVBoxFolder } from './browser-local-files.mjs'
// #endif
const sessions = new Map()
const remember = folder => { if (folder) sessions.set(folder.id, folder); return folder }

function desktop() {
  // #ifdef H5
  return typeof window !== 'undefined' ? window.localVideoDesktop : null
  // #endif
  // #ifndef H5
  return null
  // #endif
}
export function canImportTVBoxFolder() {
  if (desktop()?.pickTVBoxFolder || isAndroidTVBox()) return true
  // #ifdef H5
  return canImportBrowserTVBoxFolder()
  // #endif
  // #ifndef H5
  return false
  // #endif
}
export async function pickTVBoxFolder() {
  if (desktop()?.pickTVBoxFolder) return remember(await desktop().pickTVBoxFolder())
  if (isAndroidTVBox()) { const selected = await pickAndroidDirectory(); return selected ? remember(await importAndroidTVBoxFolder(selected.uri)) : null }
  // #ifdef H5
  if (canImportBrowserTVBoxFolder()) return remember(await pickBrowserTVBoxFolder())
  // #endif
  throw new Error('当前浏览器不支持选择配置文件夹，请使用新版 Edge 或 Chrome')
}
export async function restoreTVBoxFolder(id) {
  if (sessions.has(id)) return sessions.get(id)
  if (desktop()?.restoreTVBoxFolder) return remember(await desktop().restoreTVBoxFolder(id))
  if (isAndroidTVBox()) return remember(await restoreAndroidTVBoxFolder(id))
  // #ifdef H5
  if (!desktop()) return remember(await restoreBrowserTVBoxFolder(id))
  // #endif
  throw new Error('请在原设备的 App 中打开此本地配置，或选择网络资源')
}
export async function restoreLocalRecipe(recipe) {
  return recipe?.localRoot ? refreshLocalReferences(recipe, await restoreTVBoxFolder(recipe.localRoot.id)) : recipe
}
