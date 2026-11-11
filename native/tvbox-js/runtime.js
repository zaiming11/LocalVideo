import { parser, CryptoJS } from './libraries.js'

// Runs in a dedicated, non-visible Android WebView, never in the app page.
// Only request, namespaced storage and completion are exposed by the host.
export async function start(config, native = globalThis.LocalVideoSpider) {
  const decode = value => typeof value === 'string' && value.trim() ? JSON.parse(value) : value
  const complete = (id, value, error = '') => native.complete(id, JSON.stringify(value ?? null), error)
  const sourceUrl = config.api
  let requestFailures = []
  const absolute = (value, base = sourceUrl) => new URL(value, base).href
  const document = html => parser.load(String(html ?? ''), { decodeEntities: true })
  function select(html, path, many) {
    const $ = document(html), parts = String(path).split('&&')
    const attribute = many ? null : parts.pop()
    let nodes = $.root()
    for (const part of parts) if (part.trim()) nodes = nodes.find(part.trim())
    if (many) return nodes.toArray().map(node => $.html(node))
    const node = nodes.first()
    return attribute === 'Text' ? node.text() : attribute === 'Html' ? node.html() || '' : node.attr(attribute) || ''
  }
  const local = {
    get: (namespace, key) => native.storage('get', String(namespace), String(key), ''),
    set: (namespace, key, value) => native.storage('set', String(namespace), String(key), String(value)),
    delete: (namespace, key) => native.storage('delete', String(namespace), String(key), '')
  }
  Object.assign(globalThis, {
    CryptoJS, local,
    req: (url, options = {}) => {
      const result = JSON.parse(native.request(absolute(url), JSON.stringify(options)))
      if (result.error) { requestFailures.push(result.error); throw new Error(result.error) }
      if (result.code >= 400) requestFailures.push('源接口返回 HTTP ' + result.code + '（' + new URL(url,sourceUrl).host + '），请更新站点规则或切换线路')
      if (options.buffer === 1) result.content = Uint8Array.from(atob(result.content), char => char.charCodeAt(0))
      return result
    },
    pdfh: (html, path) => select(html, path, false),
    pdfa: (html, path) => select(html, path, true),
    pd: (html, path, base) => { const value = select(html, path, false); return value ? absolute(value, base || sourceUrl) : '' },
    joinUrl: (base, value) => absolute(value, base),
    getProxy: () => config.proxy,
    base64Encode: value => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(String(value))),
    base64Decode: value => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(String(value))),
    md5: value => CryptoJS.MD5(String(value)).toString(),
    print: (...args) => console.log(...args), log: (...args) => console.log(...args)
  })
  // Older Android WebViews can lack replaceAll even when modules are supported.
  if (!String.prototype.replaceAll) Object.defineProperty(String.prototype, 'replaceAll', {value(search, replacement) {
    if (search instanceof RegExp) { if (!search.global) throw new TypeError('replaceAll requires a global RegExp'); return this.replace(search, replacement) }
    return this.replace(new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
  }})
  try {
    const module = await import(sourceUrl)
    let spider = module.default || module
    if (typeof module.__jsEvalReturn === 'function') spider = await module.__jsEvalReturn()
    if (typeof spider.init !== 'function' || typeof spider.home !== 'function') throw new Error('脚本未导出 TVBox init/home 接口；此 JS 格式尚未支持')
    await spider.init(config.ext ?? '')
    globalThis.__localvideoInvoke = async (id, action, args) => {
      try {
        requestFailures = []
        let result
        if (action === 'home') {
          result = decode(await spider.home(true)) || {}
          if (!result.list?.length && typeof spider.homeVod === 'function') {
            const recommendations = decode(await spider.homeVod())
            result.list = recommendations?.list || []
          }
        } else if (action === 'category') result = await spider.category(String(args.id || ''), Number(args.page) || 1, true, args.extend || {})
        else if (action === 'search') result = await spider.search(String(args.keyword || ''), false, Number(args.page) || 1)
        else if (action === 'detail') result = await spider.detail(String(args.id || ''))
        else if (action === 'play') result = await spider.play(String(args.flag || ''), String(args.url || ''), args.flags || [])
        else if (action === 'proxy' && typeof spider.proxy === 'function') result = await spider.proxy(args)
        else throw new Error('JS Spider 不支持操作：' + action)
        const value = decode(result)
        if (Array.isArray(value?.list)) {
          const placeholders = value.list.filter(item => item.vod_id === 'no_data')
          if (placeholders.length) value.list = value.list.filter(item => item.vod_id !== 'no_data')
          if (!value.list.length && requestFailures.length) {
            if (action === 'home' && value.class?.length) value.sourceWarning = requestFailures[requestFailures.length-1]
            else throw new Error(requestFailures[requestFailures.length-1])
          }
        }
        complete(id, value)
      } catch (error) { complete(id, null, error.message || String(error)) }
    }
    complete('ready', true)
  } catch (error) { complete('ready', null, 'JS Spider 初始化失败：' + (error.message || String(error))) }
}
