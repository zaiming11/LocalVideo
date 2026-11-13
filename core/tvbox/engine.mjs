import { JSON5, XMLParser, XMLValidator, UniversalURL as URL } from './vendor.mjs'
import { isBrowserLocalUrl } from './local-reference.mjs'

export const DEFAULT_HEADERS = { 'User-Agent': 'okhttp/3.12.13' }
const list = value => value == null ? [] : Array.isArray(value) ? value : [value]
const string = value => value == null ? '' : String(value)
export function httpUrl(value, base) {
  if (!string(value).trim()) return ''
  try { const url = new URL(string(value).trim(), base || undefined); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}
export function localOrigin(url) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) } catch { return false }
}
export function mediaSource(value, base) {
  const parts = string(value).trim().split(/@(User-Agent|Referer|Origin|Cookie|Authorization|Accept|Accept-Language|Accept-Encoding)=/i)
  const headers = {}, names = { 'user-agent': 'User-Agent', referer: 'Referer', origin: 'Origin', cookie: 'Cookie', authorization: 'Authorization', accept: 'Accept', 'accept-language': 'Accept-Language', 'accept-encoding': 'Accept-Encoding' }
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const header = parts[i + 1].trim()
    if (header && !/[\r\n]/.test(header)) headers[names[parts[i].toLowerCase()]] = header
  }
  return { url: httpUrl(parts[0], base), headers }
}
export function parseData(text) {
  if (typeof text === 'object' && text) return text
  const source = string(text).replace(/^\uFEFF/, '').trim()
  if (/^<(?:\?xml|rss\b)/i.test(source)) {
    const valid = XMLValidator.validate(source)
    if (valid !== true) throw new Error('XML 接口格式不正确')
    const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, processEntities: false }).parse(source)
    const rss = xml.rss || xml
    return {
      class: list(rss.class?.ty).map(item => ({ type_id: item['@id'], type_name: item['#text'] || '' })),
      page: rss.list?.['@page'], pagecount: rss.list?.['@pagecount'],
      list: list(rss.list?.video).map(item => {
        const groups = list(item.dl?.dd)
        return { vod_id: item.id, vod_name: item.name, vod_pic: item.pic, vod_remarks: item.note || item.dt,
          vod_content: item.des, vod_play_from: groups.map(g => g['@flag'] || '默认线路').join('$$$'),
          vod_play_url: groups.map(g => typeof g === 'string' ? g : g['#text'] || '').join('$$$') }
      })
    }
  }
  if (/^<!doctype|^<html/i.test(source)) throw new Error('地址返回了网页，请确认配置地址及请求头是否适用于该接口')
  try { return JSON5.parse(source) } catch { throw new Error('配置或接口数据不是有效 JSON/XML；可能已失效或需要专用解密插件') }
}
export function siteSupport(site, options = {}) {
  if ([0, 1, 4].includes(Number(site.type)) && /^https?:\/\//i.test(site.api)) return { supported: true, reason: '' }
  if (Number(site.type) === 3 && options.android && /^https?:\/\/.*\.m?js(?:[?#]|$)/i.test(site.api)) return { supported: true, native: true, javascript: true, reason: '' }
  if (Number(site.type) === 3 && options.android && /^csp_/.test(site.api) && site.jar) return { supported: true, native: true, reason: '' }
  if (Number(site.type) === 3 && options.android && /^https?:\/\/.*\.py(?:[?#]|$)/i.test(site.api)) return { supported: true, native: true, python: true, reason: '' }
  if (Number(site.type) === 3 && /\.py(?:[?#]|$)/i.test(site.api)) return { supported: false, reason: 'Python Spider 目前仅支持安卓 App；Windows／浏览器请使用 HTTP 接口源' }
  if (Number(site.type) === 3 && options.android && /^csp_/.test(site.api)) return { supported: false, reason: '此站点使用 Android CSP/JAR 插件，但配置未提供有效的 Spider JAR 地址' }
  if (Number(site.type) === 3 && options.android) return { supported: false, reason: '此站点的插件格式尚未支持；安卓 App 支持 CSP/JAR、JS 和 Python Spider' }
  if (Number(site.type) === 3) return { supported: false, reason: /\.m?js(?:[?#]|$)/i.test(site.api) ? 'JS Spider 当前支持安卓 App；此平台请使用 HTTP 接口源' : '此站点需要 Android JAR / DEX 插件，Windows 版不支持；请使用安卓 App 或切换 PC 兼容的 HTTP 接口源' }
  return { supported: false, reason: '该站点类型尚未支持；可使用 XML、JSON 或 Type 4 HTTP 接口源' }
}
export function parseConfig(text, url = '', options = {}) {
  let data, playlistChannels = 0
  try { data = parseData(text) } catch (error) {
    const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '').trim() : ''
    const playlist = !/^[<{\[]/.test(source) && (/^#EXTM3U\b/i.test(source) && /#EXTINF:[^\r\n]*,[ \t]*[^\s]/.test(source) || /^[^,#\r\n]+,https?:\/\/\S+[ \t]*$/m.test(source))
    const channels = playlist ? parseLive(source, url) : []
    if (!channels.length) throw error
    playlistChannels = channels.length
    data = { lives: [{ name: '直播列表', ...(httpUrl(url) ? { url } : { channels: channels.map(channel => ({ name: channel.name, urls: [channel.url] })) }) }] }
  }
  if (!data || typeof data !== 'object') throw new Error('配置内容为空')
  if (data.errmsg && !data.sites && !data.urls && !data.lives) throw new Error(string(data.errmsg))
  const warehouses = list(data.urls).map((item, index) => ({ name: string(item.name || `配置 ${index + 1}`), url: httpUrl(item.url, url) })).filter(item => item.url)
  let sites = list(data.sites)
  if (!sites.length && (data.class || data.list) && url) sites = [{ key: 'direct-api', name: '当前影视接口', type: /^\s*</.test(string(text)) ? 0 : 1, api: url }]
  sites = sites.slice(0, 2000).map((site, index) => {
    const api = /^csp_|^\s*\{/.test(string(site.api)) ? string(site.api) : httpUrl(site.api, url)
    const result = { key: string(site.key || index), name: string(site.name || site.key || `站点 ${index + 1}`), type: Number(site.type), api, searchable: site.searchable !== 0, headers: site.header || site.headers || {} }
    const spec = string(site.jar || data.spider).split(';md5;')
    const jar = httpUrl(spec[0], url)
    result.jar = jar ? jar + (spec[1] ? ';md5;' + spec[1] : '') : ''
    const extension = site.ext ?? ''
    const localFolderUrl = isBrowserLocalUrl(url) || localOrigin(url) && /\/local\/[a-f0-9]{32}\/[a-f0-9]{32}\//.test(url)
    const relativeExtension = typeof extension === 'string' && (/^(?:\.{1,2}\/|\/)/.test(extension.trim()) || localFolderUrl && /^(?![\s{\[]|[a-z][\w+.-]*:)[^?#\r\n]+\.(?:json5?|m?js|py|txt|conf)(?:[?#].*)?$/i.test(extension.trim()))
    result.ext = relativeExtension ? httpUrl(extension, url) || extension : extension
    return { ...result, ...siteSupport(result, options) }
  })
  const lives = list(data.lives).map((live, index) => ({ name: string(live.name || `直播 ${index + 1}`), url: httpUrl(live.url, url), channels: live.channels || [], headers: live.header || {} })).filter(live => live.url || live.channels.length)
  if (!sites.length && !warehouses.length && !lives.length) throw new Error('没有找到 TVBox 站点、仓库或直播列表')
  return { url, sites, warehouses, lives, flags: list(data.flags), parses: list(data.parses).map(p => ({ name: string(p.name), type: Number(p.type), url: httpUrl(p.url, url) })).filter(p => p.url), ...(playlistChannels ? { playlistChannels } : {}), importedAt: Date.now() }
}
export function apiUrl(site, action, args = {}) {
  if (!site.supported) throw new Error(site.reason || '不支持此站点')
  const url = new URL(site.api)
  const params = {}
  if (action === 'home') { if (site.type === 4) params.filter = 'true'; else params.ac = 'list' }
  if (action === 'category') Object.assign(params, { ac: site.type === 0 ? 'videolist' : 'detail', t: args.id, pg: args.page || 1 })
  if (action === 'search') Object.assign(params, { ac: site.type === 0 ? 'videolist' : 'detail', wd: args.keyword, pg: args.page || 1 })
  if (action === 'detail') Object.assign(params, { ac: site.type === 0 ? 'videolist' : 'detail', ids: args.id })
  if (action === 'play') Object.assign(params, { play: args.url, flag: args.flag || '' })
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, string(value))
  return url.href
}
export function cleanText(value) { return string(value).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() }
export function normalizeResponse(data, base) {
  const value = parseData(data)
  if (value?.hostAdmission === 'pending') throw new Error(cleanText(value.list?.[0]?.vod_remarks) || 'Android 爬虫组件加载失败，请检查安卓引擎')
  if (!value || (!Array.isArray(value.list) && !Array.isArray(value.class))) throw new Error(cleanText(value?.msg || value?.errmsg) || '接口未返回影视列表')
  return { categories: list(value.class).map(item => ({ id: string(item.type_id), name: cleanText(item.type_name) })),
    page: Number(value.page) || 1, pages: Math.max(1, Number(value.pagecount) || 1),
    items: list(value.list).map(item => { const picture = mediaSource(item.vod_pic, base); return { id: string(item.vod_id), name: cleanText(item.vod_name), pic: picture.url, picHeaders: picture.headers, remarks: cleanText(item.vod_remarks), description: cleanText(item.vod_content), from: string(item.vod_play_from), play: string(item.vod_play_url) } }), ...(value.sourceWarning ? { warning: cleanText(value.sourceWarning) } : {}) }
}
export function episodeGroups(item) {
  const flags = string(item.from).split('$$$')
  return string(item.play).split('$$$').map((group, index) => ({ name: flags[index] || `线路 ${index + 1}`, flag: flags[index] || '',
    episodes: group.split('#').filter(Boolean).map((entry, i) => { const split = entry.indexOf('$'); return { name: split < 0 ? `第 ${i + 1} 集` : entry.slice(0, split), url: split < 0 ? entry : entry.slice(split + 1) } }).filter(e => e.url) })).filter(g => g.episodes.length)
}
export function parseLive(text, base = '') {
  const channels = []
  let group = '直播', pending = null
  for (const raw of string(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF:')) {
      const comma = line.indexOf(',')
      pending = { name: line.slice(comma + 1).trim() || '未命名频道', group: /group-title="([^"]*)"/.exec(line)?.[1] || group }
    } else if (!line.startsWith('#')) {
      if (pending) { const url = httpUrl(line, base); if (url) channels.push({ ...pending, url }); pending = null }
      else { const comma = line.indexOf(','); if (comma < 0) continue; const name = line.slice(0, comma).trim(), target = line.slice(comma + 1).trim(); if (target === '#genre#') group = name; else { const url = httpUrl(target, base); if (url) channels.push({ name, url, group }) } }
    }
  }
  return channels.slice(0, 5000)
}
export async function resolveEpisode(recipe, request, invokeSpider) {
  const { site, flag, config } = recipe
  let result = { url: recipe.url, header: site?.headers || {}, parse: 0 }
  if (site?.type === 3) {
    if (!invokeSpider) throw new Error('当前平台没有 Android Spider 引擎')
    result = parseData((await invokeSpider(site, 'play', { url: recipe.url, flag, flags: config?.flags || [] })).body)
  } else if (site?.type === 4) result = parseData((await request(apiUrl(site, 'play', { url: recipe.url, flag }), site.headers, config?.url)).body)
  else if (config?.flags?.includes(flag) && !/\.(m3u8|mp4|webm|m4v|mpd)(?:[?#]|$)/i.test(recipe.url)) result.parse = 1
  if (Number(result.parse) === 1) {
    const parser = config?.parses?.find(p => p.type === 1)
    if (!parser) throw new Error('此线路需要网页嗅探或专用解析插件，请切换可直接播放的线路')
    result = parseData((await request(parser.url + encodeURIComponent(result.url || recipe.url), {}, config.url)).body)
    if (Number(result.parse) === 1) throw new Error('解析接口仍返回待嗅探页面，请切换线路')
  }
  const source = mediaSource(result.url, httpUrl(site?.api) || config?.url), url = source.url
  if (!url) throw new Error('接口没有返回可播放的 HTTP 视频地址')
  return { url, headers: { ...site?.headers, ...source.headers, ...(result.header || result.headers || {}) }, hls: /\.m3u8(?:[?#]|$)/i.test(url) || /hls|m3u8/i.test(string(result.type)), allowLocal: localOrigin(config?.url) }
}
