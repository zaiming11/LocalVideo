import { Readable } from 'node:stream'
import network from '../desktop/tvbox-network.cjs'

export function tvboxDevPlugin() {
  return { name: 'localvideo-tvbox', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/__tvbox/')) return next()
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { res.writeHead(403).end(); return }
      try {
        if (req.url.startsWith('/__tvbox/media/')) {
          const response = await network.mediaResponse(new Request('http://' + req.headers.host + req.url, { method: req.method, headers: req.headers }), '/__tvbox/media/')
          res.writeHead(response.status, Object.fromEntries(response.headers))
          if (response.body) { const stream = Readable.fromWeb(response.body); res.on('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res) } else res.end()
          return
        }
        if (req.url !== '/__tvbox/request' || req.method !== 'POST') { res.writeHead(404).end(); return }
        let body = ''
        for await (const chunk of req) { body += chunk; if (body.length > 64000) throw new Error('请求过大') }
        const input = JSON.parse(body)
        const data = await network.requestText(input.url, input.headers, !!input.allowLocal)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data))
      } catch (error) { res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: error.message })) }
    })
  } }
}
