// Remote media proxy shared by the Electron main process and the Vite dev
// server. Every outbound request is resolved to a concrete IP first and that IP
// is then connected to directly, so a hostname cannot rebind to a private
// address between the check and the connection.
const http = require('node:http')
const https = require('node:https')
const dns = require('node:dns').promises
const net = require('node:net')
const { URL } = require('node:url')

const MAX_REDIRECTS = 5
const TIMEOUT_MS = 25000
const MAX_TEXT_BYTES = 4 * 1024 * 1024
const MAX_STREAM_BYTES = 32 * 1024 * 1024
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// Headers a remote source may legitimately need. `host` is always derived from
// the target URL and never taken from the caller.
const ALLOWED_HEADERS = ['user-agent', 'referer', 'origin', 'accept', 'accept-language', 'cookie', 'authorization', 'range', 'if-range', 'if-modified-since', 'if-none-match']

class ProxyError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/* ------------------------------------------------------------------ *
 * Address validation
 * ------------------------------------------------------------------ */

function isBlockedIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = parts
  if (a === 0) return true                                    // 0.0.0.0/8 "this network"
  if (a === 10) return true                                   // 10.0.0.0/8 private
  if (a === 127) return true                                  // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true            // 100.64.0.0/10 carrier NAT
  if (a === 169 && b === 254) return true                      // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true             // 172.16.0.0/12 private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true            // 6to4 relay anycast
  if (a === 192 && b === 168) return true                       // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true          // benchmarking
  if (a === 198 && b === 51 && c === 100) return true           // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true            // TEST-NET-3
  if (a >= 224) return true                                     // multicast, reserved, broadcast
  return false
}

function isBlockedIPv6(ip) {
  const lower = String(ip).toLowerCase().split('%')[0]
  if (lower === '::' || lower === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped) return isBlockedIPv4(mapped[1])
  const compat = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (compat) return isBlockedIPv4(compat[1])
  const head = lower.slice(0, 4)
  if (head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) return true // link-local
  if (head.startsWith('fc') || head.startsWith('fd')) return true  // unique local
  if (head.startsWith('ff')) return true                            // multicast
  if (lower.startsWith('2001:db8')) return true                     // documentation
  if (lower.startsWith('2002:') || lower.startsWith('3ffe:')) return true // 6to4 / 6bone
  if (lower === '100::' || lower.startsWith('100::')) return true    // discard-only prefix
  return false
}

function isBlockedAddress(ip) {
  const family = net.isIP(ip)
  if (family === 4) return isBlockedIPv4(ip)
  if (family === 6) return isBlockedIPv6(ip)
  return true
}

/**
 * Resolve a hostname and reject the request when any returned address is
 * private. The chosen address is returned so the caller can connect to it
 * directly instead of resolving a second time.
 */
async function resolvePublicAddress(hostname) {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new ProxyError('BLOCKED', '目标地址指向本机或内网，已拒绝访问')
    return hostname
  }
  let records
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw new ProxyError('DNS', `无法解析域名：${hostname}`)
  }
  if (!records || !records.length) throw new ProxyError('DNS', `无法解析域名：${hostname}`)
  for (const record of records) {
    if (isBlockedAddress(record.address)) throw new ProxyError('BLOCKED', '目标地址指向本机或内网，已拒绝访问')
  }
  return records[0].address
}

/* ------------------------------------------------------------------ *
 * URL / header helpers
 * ------------------------------------------------------------------ */

function assertRemoteHttpUrl(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new ProxyError('BAD_URL', '地址格式不正确')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProxyError('BAD_SCHEME', '只支持 http 与 https 地址')
  }
  if (!parsed.hostname) throw new ProxyError('BAD_URL', '地址缺少主机名')
  return parsed
}

function sanitizeHeaders(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    const name = String(key).toLowerCase().trim()
    if (!ALLOWED_HEADERS.includes(name)) continue
    if (value === null || value === undefined) continue
    const text = String(value)
    // Header values must not be able to inject extra headers.
    if (/[\r\n]/.test(text)) continue
    out[name] = text
  }
  if (!out['user-agent']) out['user-agent'] = DEFAULT_UA
  return out
}

function base64UrlEncode(text) {
  return Buffer.from(String(text), 'utf8').toString('base64url')
}

function base64UrlDecode(text) {
  return Buffer.from(String(text), 'base64url').toString('utf8')
}

/**
 * Build the address that the player will request. The desktop build uses the
 * `remotemedia://` scheme registered in main.cjs; the Vite dev server exposes
 * the same encoding under `/__remote/`.
 */
function buildProxyUrl(targetUrl, headers, prefix) {
  const encoded = base64UrlEncode(targetUrl)
  const headerEntries = Object.entries(headers || {})
  const query = headerEntries.length ? `?h=${base64UrlEncode(JSON.stringify(headers))}` : ''
  return `${prefix}${encoded}${query}`
}

/**
 * Decode a proxy address back into `{ target, headers }`. Returns null when the
 * shape is wrong so the caller can answer 400 without throwing.
 */
function decodeProxyUrl(rawUrl, { scheme = 'remotemedia:', host = 'proxy', pathPrefix = null } = {}) {
  let parsed
  try {
    parsed = new URL(rawUrl, 'http://invalid.local')
  } catch {
    return null
  }
  let encoded
  if (pathPrefix) {
    if (!parsed.pathname.startsWith(pathPrefix)) return null
    encoded = parsed.pathname.slice(pathPrefix.length)
  } else {
    if (parsed.protocol !== scheme || parsed.hostname !== host) return null
    encoded = parsed.pathname.replace(/^\/+/, '')
  }
  if (!encoded) return null
  let target
  try {
    target = base64UrlDecode(encoded)
  } catch {
    return null
  }
  if (!/^https?:\/\//i.test(target)) return null
  let headers = {}
  const headerParam = parsed.searchParams.get('h')
  if (headerParam) {
    try {
      const parsedHeaders = JSON.parse(base64UrlDecode(headerParam))
      headers = sanitizeHeaders(parsedHeaders)
    } catch { /* a damaged header set must not break playback */ }
  }
  return { target, headers }
}

/* ------------------------------------------------------------------ *
 * Text decoding (many CMS hosts answer GBK without declaring it)
 * ------------------------------------------------------------------ */

function decodeText(buffer, contentType = '') {
  const declared = /charset=["']?([\w-]+)/i.exec(String(contentType) || '')
  const candidates = declared ? [declared[1].toLowerCase(), 'utf-8'] : ['utf-8', 'gbk', 'big5']
  for (const encoding of candidates) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(buffer)
      return text.replace(/^\uFEFF/, '')
    } catch { /* the encoding did not fit, try the next one */ }
  }
  return buffer.toString('utf8')
}

/* ------------------------------------------------------------------ *
 * HLS playlist rewriting
 * ------------------------------------------------------------------ */

function resolveUri(uri, baseUrl) {
  try {
    return new URL(uri, baseUrl).href
  } catch {
    return null
  }
}

function isPlaylistBody(text) {
  return typeof text === 'string' && text.slice(0, 4096).replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U')
}

function looksLikePlaylistUrl(url) {
  return /\.m3u8?(\?|#|$)/i.test(String(url || '').split('/').pop() || '')
}

/**
 * Rewrite every address inside a playlist so the player keeps requesting
 * through this proxy. Sensitive headers only follow the URI while it stays on
 * the same host, so a playlist cannot leak a cookie to a third party.
 *
 * @param {string} text          playlist body
 * @param {string} baseUrl       absolute address the playlist came from
 * @param {object} headers       headers used for this playlist
 * @param {(absUrl: string, headers: object|null) => string} toProxyUrl
 */
function rewritePlaylist(text, baseUrl, headers, toProxyUrl) {
  let baseHost = ''
  try {
    baseHost = new URL(baseUrl).host
  } catch { /* keep baseHost empty and forward headers unchanged */ }

  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push(line)
      continue
    }
    if (trimmed.startsWith('#')) {
      // #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA all carry URI="…" attributes.
      out.push(trimmed.replace(/URI="([^"]*)"/gi, (match, uri) => {
        const abs = resolveUri(uri, baseUrl)
        if (!abs) return match
        return `URI="${toProxyUrl(abs, headersFor(abs, baseHost, headers))}"`
      }))
      continue
    }
    const abs = resolveUri(trimmed, baseUrl)
    out.push(abs ? toProxyUrl(abs, headersFor(abs, baseHost, headers)) : trimmed)
  }
  return out.join('\n')
}

function headersFor(absUrl, baseHost, headers) {
  if (!baseHost) return headers
  try {
    return new URL(absUrl).host === baseHost ? headers : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * The actual request
 * ------------------------------------------------------------------ */

function requestOnce(target, address, method, headers) {
  return new Promise((resolve, reject) => {
    const secure = target.protocol === 'https:'
    const transport = secure ? https : http
    const port = target.port ? Number(target.port) : secure ? 443 : 80
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      reject(new ProxyError('BAD_PORT', '端口号不合法'))
      return
    }
    const options = {
      host: address,
      port,
      path: `${target.pathname || '/'}${target.search || ''}`,
      method,
      headers: { ...headers, host: target.host },
      timeout: TIMEOUT_MS
    }
    // TLS must still validate the certificate against the real hostname.
    if (secure) options.servername = target.hostname
    const request = transport.request(options, (response) => resolve(response))
    request.on('timeout', () => {
      request.destroy(new ProxyError('TIMEOUT', '连接超时'))
    })
    request.on('error', (error) => {
      reject(error instanceof ProxyError ? error : new ProxyError('NETWORK', error?.message || '网络连接失败'))
    })
    request.end()
  })
}

function readBody(response, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    response.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        response.destroy()
        reject(new ProxyError('TOO_LARGE', '响应内容超过大小限制'))
        return
      }
      chunks.push(chunk)
    })
    response.on('end', () => resolve(Buffer.concat(chunks)))
    response.on('error', (error) => reject(new ProxyError('NETWORK', error?.message || '读取响应失败')))
  })
}

/**
 * Fetch a remote address, transparently following redirects. Every hop is
 * re-validated, so a public host cannot redirect into the local network.
 *
 * @returns {Promise<{status:number, headers:object, finalUrl:string, body:Buffer}>}
 */
async function fetchBuffer(rawUrl, options = {}) {
  const method = ['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase())
    ? String(options.method).toUpperCase()
    : 'GET'
  let target = assertRemoteHttpUrl(rawUrl)
  let headers = { ...sanitizeHeaders(options.headers), ...(options.extraHeaders || {}) }
  if (options.range) headers.range = String(options.range)

  let response = null
  let hops = 0
  while (true) {
    const address = await resolvePublicAddress(target.hostname)
    response = await requestOnce(target, address, method, headers)
    const status = response.statusCode || 0
    const location = response.headers.location
    if (status >= 300 && status < 400 && location && hops < MAX_REDIRECTS && method === 'GET') {
      const next = resolveUri(location, target.href)
      response.resume()
      if (!next) throw new ProxyError('BAD_REDIRECT', '重定向地址无法解析')
      // Capture the origin host before reassigning, otherwise the comparison
      // below is against itself and credentials would follow the redirect.
      const previousHost = target.host
      target = assertRemoteHttpUrl(next)
      // Credentials never follow a redirect to another host.
      if (target.host !== previousHost) {
        headers = { 'user-agent': headers['user-agent'] || DEFAULT_UA }
      }
      hops++
      continue
    }
    if (status >= 300 && status < 400 && location) {
      response.resume()
      throw new ProxyError('TOO_MANY_REDIRECTS', `重定向次数过多（最多 ${MAX_REDIRECTS} 次）`)
    }
    break
  }

  const body = method === 'HEAD' ? Buffer.alloc(0) : await readBody(response, options.limit || MAX_TEXT_BYTES)
  return {
    status: response.statusCode || 0,
    headers: response.headers,
    finalUrl: target.href,
    body
  }
}

/**
 * Fetch a remote address for streaming playback. The caller owns the returned
 * stream and must consume or destroy it.
 */
async function fetchStream(rawUrl, options = {}) {
  const method = ['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase())
    ? String(options.method).toUpperCase()
    : 'GET'
  let target = assertRemoteHttpUrl(rawUrl)
  let headers = { ...sanitizeHeaders(options.headers), ...(options.extraHeaders || {}) }
  if (options.range) headers.range = String(options.range)

  let response = null
  let hops = 0
  while (true) {
    const address = await resolvePublicAddress(target.hostname)
    response = await requestOnce(target, address, method, headers)
    const status = response.statusCode || 0
    const location = response.headers.location
    if (status >= 300 && status < 400 && location && hops < MAX_REDIRECTS && method === 'GET') {
      const next = resolveUri(location, target.href)
      response.resume()
      if (!next) throw new ProxyError('BAD_REDIRECT', '重定向地址无法解析')
      const previousHost = target.host
      target = assertRemoteHttpUrl(next)
      if (target.host !== previousHost) {
        headers = { 'user-agent': headers['user-agent'] || DEFAULT_UA }
        if (options.range) headers.range = String(options.range)
      }
      hops++
      continue
    }
    if (status >= 300 && status < 400 && location) {
      response.resume()
      throw new ProxyError('TOO_MANY_REDIRECTS', `重定向次数过多（最多 ${MAX_REDIRECTS} 次）`)
    }
    break
  }
  return { status: response.statusCode || 0, headers: response.headers, finalUrl: target.href, stream: response }
}

/**
 * Read the Range header from either a Node incoming message (plain object) or a
 * WHATWG Request (Headers instance), both of which reach this handler.
 */
function readRangeHeader(request) {
  const headers = request?.headers
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get('range')
  return headers.range || headers.Range || null
}

/**
 * One shared request handler so the Electron protocol and the Vite middleware
 * behave identically. `toProxyUrl` decides the address shape for the caller's
 * own transport.
 *
 * @returns {Promise<{status:number, headers:object, body:Buffer|NodeJS.ReadableStream}>}
 */
async function handleRemoteRequest(request, { toProxyUrl, shape = {} }) {
  const decoded = decodeProxyUrl(request.url, shape)
  if (!decoded) {
    return { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: Buffer.from('代理地址无效', 'utf8') }
  }
  const method = ['GET', 'HEAD'].includes(String(request.method || 'GET').toUpperCase()) ? String(request.method).toUpperCase() : 'GET'
  const range = readRangeHeader(request)

  const target = assertRemoteHttpUrlSafe(decoded.target)
  if (!target) {
    return { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: Buffer.from('目标地址不被允许', 'utf8') }
  }

  let result
  try {
    result = await fetchStream(decoded.target, { method, headers: decoded.headers, range })
  } catch (error) {
    const status = error instanceof ProxyError && error.code === 'BLOCKED' ? 403 : 502
    return { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: Buffer.from(error?.message || '代理请求失败', 'utf8') }
  }

  const contentType = String(result.headers['content-type'] || '')
  const wantsPlaylist = method === 'GET' && (
    /mpegurl|m3u8/i.test(contentType) || looksLikePlaylistUrl(result.finalUrl) || looksLikePlaylistUrl(decoded.target)
  )

  if (wantsPlaylist) {
    // Playlists are small; buffer them so the addresses can be rewritten.
    let body
    try {
      body = await readBody(result.stream, MAX_TEXT_BYTES)
    } catch (error) {
      return { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: Buffer.from(error?.message || '读取播放列表失败', 'utf8') }
    }
    const text = decodeText(body, contentType)
    if (isPlaylistBody(text)) {
      const rewritten = rewritePlaylist(text, result.finalUrl, decoded.headers, toProxyUrl)
      const out = Buffer.from(rewritten, 'utf8')
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Content-Length': String(out.length),
          'Cache-Control': 'no-cache'
        },
        body: out
      }
    }
    // Not a playlist after all — hand the bytes back untouched.
    return {
      status: result.status,
      headers: { 'Content-Type': contentType || 'application/octet-stream', 'Content-Length': String(body.length) },
      body
    }
  }

  const headers = {
    'Content-Type': contentType || guessStreamType(decoded.target),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  }
  if (result.headers['content-length']) headers['Content-Length'] = String(result.headers['content-length'])
  if (result.headers['content-range']) headers['Content-Range'] = String(result.headers['content-range'])
  return { status: result.status, headers, body: method === 'HEAD' ? Buffer.alloc(0) : result.stream }
}

function assertRemoteHttpUrlSafe(raw) {
  try {
    return assertRemoteHttpUrl(raw)
  } catch {
    return null
  }
}

function guessStreamType(url) {
  const tail = String(url || '').split('?')[0].split('#')[0].toLowerCase()
  if (tail.endsWith('.ts')) return 'video/mp2t'
  if (tail.endsWith('.m4s')) return 'video/iso.segment'
  if (tail.endsWith('.mp4') || tail.endsWith('.m4v')) return 'video/mp4'
  if (tail.endsWith('.webm')) return 'video/webm'
  if (tail.endsWith('.mkv')) return 'video/x-matroska'
  if (tail.endsWith('.flv')) return 'video/x-flv'
  if (tail.endsWith('.jpg') || tail.endsWith('.jpeg')) return 'image/jpeg'
  if (tail.endsWith('.png')) return 'image/png'
  if (tail.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

module.exports = {
  ProxyError,
  MAX_REDIRECTS,
  MAX_TEXT_BYTES,
  MAX_STREAM_BYTES,
  isBlockedAddress,
  isBlockedIPv4,
  isBlockedIPv6,
  resolvePublicAddress,
  assertRemoteHttpUrl,
  sanitizeHeaders,
  base64UrlEncode,
  base64UrlDecode,
  buildProxyUrl,
  decodeProxyUrl,
  decodeText,
  rewritePlaylist,
  isPlaylistBody,
  looksLikePlaylistUrl,
  resolveUri,
  fetchBuffer,
  fetchStream,
  handleRemoteRequest,
  guessStreamType
}
