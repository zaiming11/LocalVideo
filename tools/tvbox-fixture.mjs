// Offline integration fixture; not imported into production.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import media from '../desktop/media-library.cjs'
const root = fileURLToPath(new URL('../', import.meta.url))
export async function startFixture({ port = 0, hlsDir = '' } = {}) {
  let base
  const requests = []
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    requests.push({ path: url.pathname, search: url.search, range: req.headers.range, referer: req.headers.referer })
    const send = data => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data))
    const movie = { vod_id: 'fixture', vod_name: '本机测试影片', vod_pic: '', vod_remarks: '本地测试素材',
      vod_content: '验证配置、分类、搜索、选集与 HLS，不是线上影视源。',
      vod_play_from: 'MP4$$$HLS',
      vod_play_url: '第一集$' + base + '/video.mp4#第二集$' + base + '/video.mp4?episode=2$$$HLS 第一集$' + base + '/hls/index.m3u8#HLS 第二集$' + base + '/hls/index.m3u8?episode=2' }
    if (url.pathname === '/config.json') return send({ sites: [
      { key: 'json', name: 'JSON 接口验证', type: 1, api: base + '/api', header: { Referer: 'https://fixture.example/' } },
      { key: 'type4', name: 'Type 4 解析验证', type: 4, api: base + '/type4', header: { Referer: 'https://fixture.example/' } },
      { key: 'xml', name: 'XML 接口验证', type: 0, api: base + '/xml' },
      { key: 'android', name: 'Android 插件提示验证', type: 3, api: 'csp_Demo' }
    ], lives: [{ name: 'M3U 直播验证', url: base + '/live.m3u' }] })
    if (url.pathname === '/warehouse.json') return send({ urls: [{ name: '测试仓库', url: './config.json' }] })
    if (url.pathname === '/live.m3u') { res.writeHead(200).end('#EXTM3U\n#EXTINF:-1 group-title="测试频道",本机频道\n' + base + '/video.mp4'); return }
    if (url.pathname === '/xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' }).end('<rss><class><ty id="1">测试分类</ty></class><list page="1" pagecount="1"><video><id>xml1</id><name>XML 测试影片</name><dl><dd flag="MP4"><![CDATA[正片$' + base + '/video.mp4]]></dd></dl></video></list></rss>'); return
    }
    if (['/api', '/type4'].includes(url.pathname)) {
      if (req.headers.referer !== 'https://fixture.example/') { res.writeHead(403).end(); return }
      if (url.searchParams.has('play')) return send({ parse: 0, url: base + '/video.mp4', header: { Referer: 'https://fixture.example/' } })
      if (url.pathname === '/type4') movie.vod_play_url = '解析第一集$opaque-episode'
      return send({ class: [{ type_id: '1', type_name: '测试分类' }], page: Number(url.searchParams.get('pg')) || 1, pagecount: 2, list: url.searchParams.get('wd') === '无结果' ? [] : [movie] })
    }
    let file, type
    if (url.pathname === '/video.mp4') { file = path.join(root, 'static/demo/videos/night-flight.mp4'); type = 'video/mp4' }
    else if (hlsDir && /^\/hls\/[\w.-]+$/.test(url.pathname)) { file = path.join(hlsDir, path.basename(url.pathname)); type = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }
    if (file && fs.existsSync(file)) {
      const response = await media.fileResponse(new Request(url.href, { method: req.method, headers: req.headers }), file, type)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) { const stream = Readable.fromWeb(response.body); res.on('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res) } else res.end()
      return
    }
    res.writeHead(404).end()
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + server.address().port
  return { base, requests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startFixture({ port: Number(process.env.TVBOX_FIXTURE_PORT) || 8866, hlsDir: process.env.TVBOX_FIXTURE_HLS || '' })
  console.log(fixture.base + '/config.json')
}
