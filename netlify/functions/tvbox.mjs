import network from '../../desktop/tvbox-network.cjs'

const MAX_INPUT = 64000
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export default async function handler(request) {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '不允许跨站请求' }, 403)
  const route = url.pathname.replace(/^\/\.netlify\/functions\/tvbox(?=\/|$)/, '/__tvbox')
  try {
    if (route === '/__tvbox/request') {
      if (request.method !== 'POST') return json({ error: '请求方式不支持' }, 405)
      if (Number(request.headers.get('content-length')) > MAX_INPUT) return json({ error: '请求过大' }, 413)
      const text = await request.text()
      if (new TextEncoder().encode(text).length > MAX_INPUT) return json({ error: '请求过大' }, 413)
      let input
      try { input = JSON.parse(text) } catch { return json({ error: '请求格式不正确' }, 400) }
      if (!input || typeof input.url !== 'string' || !input.url.trim()) return json({ error: '配置地址为空' }, 400)
      // A public deployment must never forward requests to its own loopback.
      return json(await network.requestText(input.url, input.headers, false))
    }
    if (route.startsWith('/__tvbox/media/')) {
      if (network.decodeMediaUrl(request.url).allowLocal) return json({ error: '在线版不支持访问本机或内网媒体' }, 400)
      const response = await network.mediaResponse(request, new URL('/__tvbox/media/', url).href)
      const headers = new Headers(response.headers)
      headers.delete('Access-Control-Allow-Origin')
      headers.set('Cache-Control', 'no-store')
      return new Response(response.body, { status: response.status, headers })
    }
    return json({ error: '接口不存在' }, 404)
  } catch (error) {
    return json({ error: error.message || '资源请求失败' }, 502)
  }
}
