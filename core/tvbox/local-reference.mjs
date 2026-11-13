export const BROWSER_LOCAL_ROOT = 'https://localvideo-folder.invalid/'
export const isBrowserLocalUrl = value => typeof value === 'string' && value.startsWith(BROWSER_LOCAL_ROOT)

export function localEntryUrl(folder, path) {
  const parts = String(path || '').split('/')
  if (!folder?.baseUrl || !parts.length || parts.some(part => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) throw new Error('本地配置路径无效')
  return folder.baseUrl + parts.map(encodeURIComponent).join('/')
}
export function localIdentity(folder, url) {
  return folder?.baseUrl && url?.startsWith(folder.baseUrl) ? `local-folder:${folder.id}/` + url.slice(folder.baseUrl.length) : url
}
export function localDescriptor(folder, entry) { return { id: folder.id, name: folder.name, entry } }
export function refreshLocalReferences(recipe, folder) {
  const previous = recipe?.localRoot?.baseUrl
  if (!previous || recipe.localRoot.id !== folder.id) return recipe
  const replace = value => typeof value === 'string' ? (value.startsWith(previous) ? folder.baseUrl + value.slice(previous.length) : value)
    : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value
  return replace(recipe)
}
