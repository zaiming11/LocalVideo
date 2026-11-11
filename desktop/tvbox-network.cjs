const http = require('node:http')
const https = require('node:https')
const dns = require('node:dns').promises
const net = require('node:net')
const zlib = require('node:zlib')
const { Readable } = require('node:stream')
const MAX_TEXT = 8 * 1024 * 1024
const allowedHeaders = new Set(['user-agent', 'referer', 'origin', 'accept', 'accept-language', 'range', 'if-range', 'cookie', 'authorization'])
function headersFor(input = {}) {
  const headers = { 'user-agent': 'okhttp/3.12.13', 'accept-encoding': 'identity' }
  for (const [key, value] of Object.entries(input)) if (allowedHeaders.has(key.toLowerCase()) && !/[\r\n]/.test(String(value))) headers[key.toLowerCase()] = String(value)
  return headers
}
function allowedAddress(address, allowLocal = false) {
  const ip = address.toLowerCase()
  if (ip.startsWith('::ffff:')) return allowedAddress(ip.slice(7), allowLocal)
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 127) return !!allowLocal
    return !(a === 0 || a === 10 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224)
  }
  if (ip === '::1') return !!allowLocal
  return net.isIP(ip) === 6 && ip !== '::' && !/^(fc|fd|fe[89ab]|ff|2001:db8)/.test(ip)
}
function transientDisconnect(error) { return ['ECONNRESET','ECONNABORTED','EPIPE','ERR_STREAM_PREMATURE_CLOSE','Z_BUF_ERROR'].includes(error?.code) }
async function retryRead(operation, signal) {
  const started=Date.now()
  try { return await operation() } catch (error) {
    if (!transientDisconnect(error) || signal?.aborted || Date.now()-started>8000) throw error
    await new Promise(resolve=>setTimeout(resolve,250))
    if (signal?.aborted) throw error
    return operation()
  }
}
async function openRemote(raw, options = {}, redirects = 0) {
  return options.retry === false ? openRemoteOnce(raw, options, redirects) : retryRead(()=>openRemoteOnce(raw,options,redirects),options.signal)
}
async function openRemoteOnce(raw, { headers = {}, allowLocal = false, method = 'GET', signal } = {}, redirects = 0) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('只允许不含账号密码的 HTTP/HTTPS 地址')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await dns.lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(item => !allowedAddress(item.address, allowLocal))) throw new Error('来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务')
  const selected = addresses[0]
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method, headers: headersFor(headers), signal,
      lookup: (_host, options, callback) => options.all ? callback(null, [selected]) : callback(null, selected.address, selected.family)
    }, resolve)
    request.setTimeout(20000, () => request.destroy(new Error('请求超时，请稍后重试')))
    request.on('error', reject)
    request.end()
  })
  if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
    response.destroy()
    if (redirects >= 5) throw new Error('重定向次数过多')
    const target = new URL(response.headers.location, url)
    const nextHeaders = headersFor(headers)
    if (target.origin !== url.origin) { delete nextHeaders.cookie; delete nextHeaders.authorization }
    return openRemoteOnce(target.href, { headers: nextHeaders, allowLocal, method, signal }, redirects + 1)
  }
  let stream = response
  const encoding = response.headers['content-encoding']
  if (encoding === 'gzip') stream = response.pipe(zlib.createGunzip())
  if (encoding === 'deflate') stream = response.pipe(zlib.createInflate())
  if (encoding === 'br') stream = response.pipe(zlib.createBrotliDecompress())
  if (stream !== response) { response.on('error', error => stream.destroy(error)); stream.on('close', () => response.destroy()) }
  return { status: response.statusCode, headers: response.headers, stream, url: url.href, decompressed: stream !== response }
}
async function readText(result) {
  const chunks = []; let size = 0
  try {
    for await (const chunk of result.stream) {
      size += chunk.length
      if (size > MAX_TEXT) throw new Error('配置或播放列表超过 8 MB 限制')
      chunks.push(chunk)
    }
  } catch (error) { result.stream.destroy(); throw error }
  const charset = /charset=([^;\s]+)/i.exec(result.headers['content-type'] || '')?.[1] || 'utf-8'
  let decoder
  try { decoder = new TextDecoder(charset) } catch { decoder = new TextDecoder('utf-8') }
  return decoder.decode(Buffer.concat(chunks))
}
async function requestText(url, headers, allowLocal = false) {
  try {
    return await retryRead(async()=>{
      const result = await openRemote(url, { headers, allowLocal, retry:false })
      if (result.status < 200 || result.status >= 300) { result.stream.destroy(); throw new Error(`接口返回 HTTP ${result.status}`) }
      return { body: await readText(result), url: result.url, contentType: result.headers['content-type'] || '' }
    })
  } catch(error) { if(transientDisconnect(error))throw new Error('接口连接被重置或中断，可能是网络或线路暂时不稳定，请稍后重试。',{cause:error});throw error }
}
function mediaUrl(url, headers = {}, allowLocal = false, prefix = 'tvboxmedia://stream/', formatHint = '') {
  const token=Buffer.from(JSON.stringify({ url, headers: headersFor(headers), allowLocal: !!allowLocal })).toString('base64url')
  // LibVLC adaptive demux selects the segment container from its URI. Preserve
  // a useful extension on HTTP proxy URLs; browser custom-scheme URLs stay stable.
  const extension=/^https?:/.test(prefix) ? (/\.(m3u8|ts|m4s|mp4|aac|mp3|key)$/i.exec(new URL(url).pathname)?.[1] || formatHint) : ''
  return prefix + token + (extension ? '.'+extension : '')
}
function decodeMediaUrl(url) {
  const parsed = new URL(url, 'http://localhost')
  const token = parsed.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.(?:m3u8|ts|m4s|mp4|aac|mp3|key)$/i,'')
  if (!token || token.length > 24000) throw new Error('视频代理地址无效')
  const value = JSON.parse(Buffer.from(token, 'base64url').toString())
  if (typeof value.url !== 'string') throw new Error('视频地址为空')
  return value
}
function rewritePlaylist(text, base, toUrl) {
  const rewrite = (raw,hint) => { const url = new URL(raw, base); if (!/^https?:$/.test(url.protocol)) throw new Error('播放列表包含不支持的协议'); return toUrl(url.href,hint) }
  const master=/#EXT-X-STREAM-INF:/.test(text),fragmented=/#EXT-X-MAP:/.test(text)
  return text.split(/\r?\n/).map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_all, value) => `URI="${rewrite(value,/^#EXT-X-(?:KEY|SESSION-KEY):/.test(line)?'key':/^#EXT-X-MAP:/.test(line)?'mp4':'m3u8')}"`) : line.trim() ? rewrite(line.trim(),master?'m3u8':fragmented?'m4s':'ts') : line).join('\n')
}
async function mediaResponse(request, prefix) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  try {
    const source = decodeMediaUrl(request.url)
    const headers = headersFor(source.headers)
    if (request.headers.get('range')) headers.range = request.headers.get('range')
    let result = await openRemote(source.url, { headers, allowLocal: source.allowLocal, method: request.method, signal: request.signal })
    const playlistRequest=request.method==='GET' && (/mpegurl/i.test(result.headers['content-type']||'') || /\.m3u8(?:[?#]|$)/i.test(result.url) || /\.m3u8(?:[?#]|$)/i.test(request.url))
    // LibVLC starts with Range: bytes=0-. A 206 manifest must still be rewritten;
    // request the complete manifest so no relative segment or key escapes proxying.
    if(playlistRequest && result.status===206){result.stream.destroy();delete headers.range;result=await openRemote(source.url,{headers,allowLocal:source.allowLocal,method:'GET',signal:request.signal})}
    const responseHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': result.headers['content-type'] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }
    for (const key of ['content-length', 'content-range']) if (result.headers[key] && !result.decompressed) responseHeaders[key] = result.headers[key]
    if (playlistRequest && [200,206].includes(result.status)) {
      const playlist = rewritePlaylist(await readText(result), result.url, (url,hint) => mediaUrl(url, source.headers, source.allowLocal, prefix,hint))
      delete responseHeaders['content-length']
      delete responseHeaders['content-range']
      responseHeaders['Accept-Ranges']='none'
      responseHeaders['Content-Type'] = 'application/vnd.apple.mpegurl'
      return new Response(playlist, { status: 200, headers: responseHeaders })
    }
    if (request.method === 'HEAD' || [204, 304].includes(result.status)) { result.stream.destroy(); return new Response(null, { status: result.status, headers: responseHeaders }) }
    return new Response(Readable.toWeb(result.stream), { status: result.status, headers: responseHeaders })
  } catch (error) { return new Response(error.message, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }) }
}
module.exports = { requestText, mediaUrl, mediaResponse, rewritePlaylist, allowedAddress, headersFor, decodeMediaUrl }
