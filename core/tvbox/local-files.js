import { isAndroidTVBox, importAndroidTVBoxFolder, restoreAndroidTVBoxFolder } from './android.js'
import { pickAndroidDirectory } from '../android-directory.js'
import { refreshLocalReferences } from './local-reference.mjs'
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
export function canImportTVBoxFolder() { return !!desktop()?.pickTVBoxFolder || isAndroidTVBox() }
export async function pickTVBoxFolder() {
  if (desktop()?.pickTVBoxFolder) return remember(await desktop().pickTVBoxFolder())
  if (isAndroidTVBox()) { const selected = await pickAndroidDirectory(); return selected ? remember(await importAndroidTVBoxFolder(selected.uri)) : null }
  throw new Error('请在 Windows 桌面版或 Android App 中加载本地配置文件夹')
}
export async function restoreTVBoxFolder(id) {
  if (sessions.has(id)) return sessions.get(id)
  if (desktop()?.restoreTVBoxFolder) return remember(await desktop().restoreTVBoxFolder(id))
  if (isAndroidTVBox()) return remember(await restoreAndroidTVBoxFolder(id))
  throw new Error('请在原设备的 App 中打开此本地配置，或选择网络资源')
}
export async function restoreLocalRecipe(recipe) {
  return recipe?.localRoot ? refreshLocalReferences(recipe, await restoreTVBoxFolder(recipe.localRoot.id)) : recipe
}
