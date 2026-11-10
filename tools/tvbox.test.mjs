import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseConfig, normalizeResponse, apiUrl, episodeGroups, parseLive, resolveEpisode, mediaSource } from '../core/tvbox/engine.mjs'
import network from '../desktop/tvbox-network.cjs'
import { startFixture } from './tvbox-fixture.mjs'
import { validateConfiguration, validateResources } from '../core/tvbox/validation.mjs'
import { TVBOX_RESOURCES } from '../core/tvbox/resources.mjs'

test('resource validation distinguishes readable configs, warehouses, unsupported formats and network failures', async () => {
  const resource = { url: 'https://example.com/config' }
  const readable = await validateConfiguration(resource, async () => ({ body: { spider: './plugin.jar', sites: [{ type: 3, api: 'csp_Test' }] } }))
  assert.equal(readable.status, 'valid'); assert.equal(readable.httpSites, 0); assert.equal(readable.pluginSites, 1)
  const warehouse = await validateConfiguration(resource, async () => ({ body: { urls: [{ name: '仓库', url: './box.json' }] } }))
  assert.equal(warehouse.label, '仓库有效'); assert.match(warehouse.detail, /未逐一验证/)
  const html = await validateConfiguration(resource, async () => ({ body: '<html>Not config</html>' }))
  assert.equal(html.status, 'unsupported')
  const denied = await validateConfiguration(resource, async () => { throw new Error('HTTP 403') })
  assert.equal(denied.status, 'unreachable'); assert.match(denied.detail, /403/)
  const timeout = await validateConfiguration(resource, () => new Promise(() => {}), 5)
  assert.equal(timeout.status, 'unreachable'); assert.match(timeout.detail, /超时/)
  assert(TVBOX_RESOURCES.length > 0 && TVBOX_RESOURCES.every(item => item.validation.status === 'valid' && item.validation.checkedAt > 0))
  assert.equal(new Set(TVBOX_RESOURCES.map(item => item.url)).size, TVBOX_RESOURCES.length)
})

test('batch validation bounds concurrency, preserves per-source outcomes and stops scheduling on unmount', async () => {
  const resources = Array.from({ length: 7 }, (_, i) => ({ url: `https://example.com/${i}` }))
  let running = 0, maximum = 0, completed = 0
  const results = await validateResources(resources, async url => {
    running++; maximum = Math.max(maximum, running)
    await new Promise(resolve => setTimeout(resolve, 5)); running--
    if (url.endsWith('/1')) throw new Error('Failed')
    return { body: { sites: [{ type: 1, api: 'https://example.com/api' }] } }
  }, { concurrency: 3, onResult: () => { completed++ } })
  assert.equal(maximum, 3); assert.equal(completed, 7); assert.equal(Object.keys(results).length, 7)
  assert.equal(results[resources[1].url].status, 'unreachable')
  let active = true, scheduled = 0
  const cancelled = await validateResources(resources, async () => { active = false; return { body: {} } }, {
    concurrency: 1, shouldContinue: () => active, onStart: () => { scheduled++ }, onResult: () => { throw new Error('Stale callback') }
  })
  assert.equal(scheduled, 1); assert.deepEqual(cancelled, {})
})

test('TXT and IPTV M3U resources import as live configurations and retain selected source URLs', async () => {
  const url='https://example.com/list.txt'
  const txt='新闻,#genre#\n频道一,https://example.com/live.m3u8\n频道二,http://example.com/live.ts'
  const config=parseConfig(txt,url)
  assert.equal(config.sites.length,0);assert.equal(config.lives[0].url,url);assert.equal(config.playlistChannels,2)
  const m3u='#EXTM3U\n#EXTINF:-1 group-title="新闻",频道一\n./live.m3u8'
  assert.equal(parseConfig(m3u,url).playlistChannels,1)
  const checked=await validateConfiguration({url},async()=>({url,body:txt}))
  assert.equal(checked.status,'valid');assert.equal(checked.label,'直播列表有效');assert.equal(checked.channels,2)
  assert.match(checked.detail,/未验证播放/)
  for(const body of ['<html>频道,http://example.com/live</html>','{"error":"频道,http://example.com/live"}','#EXTM3U\n#EXTINF:6,\nsegment.ts'])assert.throws(()=>parseConfig(body,url))
})

test('commented configs, relative warehouses and incompatible plugins', () => {
  const config = parseConfig("{//comment\n sites:[{key:'a',name:'API',type:1,api:'./api'}, {key:'b',type:3,api:'csp_Test'}, {key:'c',type:3,api:'https://example.com/test.js'}],}", 'https://example.com/config.json')
  assert.equal(config.sites[0].api, 'https://example.com/api')
  assert.equal(config.sites[0].supported, true)
  assert.equal(config.sites[1].supported, false)
  assert.match(config.sites[1].reason, /JAR/)
  assert.match(config.sites[2].reason, /JS/)
  assert.equal(parseConfig('{urls:[{name:"仓库",url:"./box.json"}]}', 'https://example.com/a.json').warehouses[0].url, 'https://example.com/box.json')
  assert.throws(() => parseConfig('<html>error</html>'), /网页/)
  assert.throws(() => parseConfig('{"errcode":10003,"errmsg":"Repo frozen"}'), /Repo frozen/)
  assert.throws(() => normalizeResponse({ hostAdmission: 'pending', list: [{ vod_remarks: '爬虫组件加载失败' }] }), /爬虫组件加载失败/)
})

test('Android CSP capability and opaque episode dispatch remain isolated from Windows', async () => {
  const raw = { spider: './plugin.jar;md5;1234', sites: [{ key: 'native', type: 3, api: 'csp_Test', ext: { token: 'test' } }] }
  const pc = parseConfig(raw, 'https://example.com/config.json')
  assert.equal(pc.sites[0].supported, false)
  const config = parseConfig(raw, 'https://example.com/config.json', { android: true })
  const site = config.sites[0]
  assert.equal(site.native, true)
  assert.equal(site.jar, 'https://example.com/plugin.jar;md5;1234')
  assert.deepEqual(site.ext, { token: 'test' })
  const recipe = { site, config, flag: 'native-line', url: 'opaque-id' }
  await assert.rejects(() => resolveEpisode(recipe, () => {}), /Android Spider/)
  const resolved = await resolveEpisode(recipe, () => { throw new Error('Should use native host') }, async (selected, action, args) => {
    assert.equal(selected, site); assert.equal(action, 'play')
    assert.equal(args.url, 'opaque-id'); assert.equal(args.flag, 'native-line')
    return { body: JSON.stringify({ parse: 0, url: 'http://127.0.0.1:9978/proxy?id=1', header: { Referer: 'https://example.com/' } }) }
  })
  assert.equal(resolved.url, 'http://127.0.0.1:9978/proxy?id=1')
  assert.equal(resolved.headers.Referer, 'https://example.com/')
  assert.equal(parseConfig({ sites: raw.sites }, config.url, { android: true }).sites[0].supported, false)
})

test('plugin extension paths use the final config URL while inline rules and opaque strings stay unchanged', () => {
  const ext = { rule: './leave-plugin-rule-as-is' }
  const config = parseConfig({ spider: './plugin.jar', sites: [
    { type: 3, api: 'csp_XBPQ', ext: './json/Dm84.json' },
    { type: 3, api: 'csp_XBPQ', ext: '../rules/test.json' },
    { type: 3, api: 'csp_XBPQ', ext: '/rules/test.json' },
    { type: 3, api: 'csp_Test', ext },
    { type: 3, api: 'csp_Test', ext: 'opaque-token' }
  ] }, 'https://example.com/dm/config.json', { android: true })
  assert.equal(config.sites[0].ext, 'https://example.com/dm/json/Dm84.json')
  assert.equal(config.sites[1].ext, 'https://example.com/rules/test.json')
  assert.equal(config.sites[2].ext, 'https://example.com/rules/test.json')
  assert.deepEqual(config.sites[3].ext, ext)
  assert.equal(config.sites[4].ext, 'opaque-token')
})

test('TVBox decorated poster and video URLs preserve their headers without sending decorations as a URL', async () => {
  const picture = 'https://img.example/poster.jpg@Referer=https://movie.example/@User-Agent=Mozilla/5.0 (Android)'
  const movie = normalizeResponse({ list: [{ vod_id: 1, vod_name: 'test', vod_pic: picture }] }, 'https://source.example/config.json').items[0]
  assert.equal(movie.pic, 'https://img.example/poster.jpg')
  assert.deepEqual(movie.picHeaders, { Referer: 'https://movie.example/', 'User-Agent': 'Mozilla/5.0 (Android)' })
  assert.equal(mediaSource('https://example.com/?email=a@b.com').url, 'https://example.com/?email=a@b.com')
  assert.deepEqual(mediaSource('https://example.com/a@Referer=x\r\nInjected: y').headers, {})
  const result = await resolveEpisode({ url: 'https://example.com/movie.m3u8@User-Agent=fixture', config: { url: 'https://source.example/' } }, () => {})
  assert.equal(result.url, 'https://example.com/movie.m3u8')
  assert.equal(result.headers['User-Agent'], 'fixture')
  assert.equal(result.hls, true)
})

test('Windows HTTP source round trip: config, browsing, search, details, Type 4 resolution and range playback', async t => {
  const fixture = await startFixture(); t.after(() => fixture.close())
  const request = (url, headers) => network.requestText(url, headers, true)
  const config = parseConfig((await request(fixture.base + '/config.json')).body, fixture.base + '/config.json')
  const site = config.sites[0]
  for (const action of ['home', 'category', 'search', 'detail']) {
    const response = await request(apiUrl(site, action, { id: '1', page: 2, keyword: '测试' }), site.headers)
    const result = normalizeResponse(response.body, response.url)
    assert.equal(result.items[0].name, '本机测试影片')
    assert.equal(result.categories[0].name, '测试分类')
    if (action === 'detail') {
      const groups = episodeGroups(result.items[0])
      assert.equal(groups.length, 2); assert.equal(groups[0].episodes.length, 2)
      assert.equal(groups[1].name, 'HLS')
    }
  }
  const resolved = await resolveEpisode({ site: config.sites[1], config, flag: 'MP4', url: 'opaque-episode' }, request)
  assert.equal(resolved.url, fixture.base + '/video.mp4')
  const response = await network.mediaResponse(new Request(network.mediaUrl(resolved.url, resolved.headers, true), { headers: { Range: 'bytes=0-31' } }))
  assert.equal(response.status, 206)
  assert.equal((await response.arrayBuffer()).byteLength, 32)
  assert(fixture.requests.some(r => r.referer === 'https://fixture.example/' && r.range === 'bytes=0-31'))
  const xml = normalizeResponse((await request(apiUrl(config.sites[2], 'detail', { id: 'xml1' }))).body, fixture.base)
  assert.equal(episodeGroups(xml.items[0])[0].episodes[0].url, fixture.base + '/video.mp4')
})

test('live lists, HLS key/map/segment rewriting and protocol boundaries', async () => {
  assert.equal(parseLive('#EXTM3U\n#EXTINF:-1 group-title="新闻",频道一\n./live.m3u8', 'https://example.com/a/list.m3u')[0].url, 'https://example.com/a/live.m3u8')
  assert.equal(parseLive('新闻,#genre#\n频道一,https://example.com/live.m3u8')[0].group, '新闻')
  const playlist = network.rewritePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\nseg.ts', 'https://example.com/hls/master.m3u8', url => 'proxy:' + url)
  assert(playlist.includes('URI="proxy:https://example.com/hls/key.bin"'))
  assert(playlist.includes('proxy:https://example.com/hls/seg.ts'))
  assert.throws(() => network.rewritePlaylist('#EXTM3U\nfile:///secret', 'https://example.com/', x => x), /协议/)
  assert.equal(network.allowedAddress('127.0.0.1'), false)
  assert.equal(network.allowedAddress('127.0.0.1', true), true)
  assert.equal(network.allowedAddress('169.254.169.254', true), false)
  assert.equal(network.allowedAddress('::ffff:127.0.0.1'), false)
  await assert.rejects(() => network.requestText('file:///secret'), /HTTP/)
})
