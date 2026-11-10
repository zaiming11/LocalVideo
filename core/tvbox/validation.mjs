import { parseConfig } from './engine.mjs'

// Validation reads configuration text only; it never downloads or executes spiders.
export async function validateConfiguration(resource, request, timeoutMs = 25000) {
  const started = Date.now()
  let response, timer
  try {
    response = await Promise.race([
      Promise.resolve().then(() => request(resource.url)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('请求超时')), timeoutMs) })
    ])
  } catch (error) {
    return { status: 'unreachable', label: '请求失败', detail: error.message || '网络请求失败', checkedAt: Date.now() }
  } finally { clearTimeout(timer) }
  try {
    const config = parseConfig(response.body, response.url || resource.url)
    const sites = config.sites.length, warehouses = config.warehouses.length, lives = config.lives.length
    const httpSites = config.sites.filter(site => [0, 1, 4].includes(site.type) && site.supported).length
    const pluginSites = config.sites.filter(site => site.type === 3).length
    const detail = [sites && `${sites} 个站点（HTTP ${httpSites} / 插件 ${pluginSites}）`, warehouses && `${warehouses} 个仓库配置（子配置未逐一验证）`, config.playlistChannels ? `${config.playlistChannels} 个频道（仅验证列表，未验证播放）` : lives && `${lives} 组直播（未验证播放）`].filter(Boolean).join(' · ')
    return { status: 'valid', label: config.playlistChannels ? '直播列表有效' : warehouses && !sites ? '仓库有效' : '配置有效', detail, sites, warehouses, lives, httpSites, pluginSites, ...(config.playlistChannels ? { channels: config.playlistChannels } : {}), finalUrl: response.url || resource.url, checkedAt: Date.now(), elapsedMs: Date.now() - started }
  } catch (error) {
    return { status: 'unsupported', label: '格式未通过', detail: error.message || '无法识别配置格式', checkedAt: Date.now() }
  }
}

export async function validateResources(resources, request, { onStart = () => {}, onResult = () => {}, shouldContinue = () => true, concurrency = 3, timeoutMs } = {}) {
  let cursor = 0
  const results = {}
  async function worker() {
    while (shouldContinue() && cursor < resources.length) {
      const resource = resources[cursor++]
      onStart(resource)
      const result = await validateConfiguration(resource, request, timeoutMs)
      if (!shouldContinue()) return
      results[resource.url] = result
      onResult(resource, result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(resources.length, Math.max(1, concurrency)) }, worker))
  return results
}
