import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localEntryUrl, localIdentity, refreshLocalReferences } from '../core/tvbox/local-reference.mjs'
import { BROWSER_LOCAL_ROOT, isBrowserLocalUrl } from '../core/tvbox/local-reference.mjs'
import { parseConfig } from '../core/tvbox/engine.mjs'
import { requestBrowserTVBoxFile } from '../core/tvbox/browser-local-files.mjs'

test('local references encode filenames, reject traversal and keep stable folder identities', () => {
  const folder={id:'abc',baseUrl:'http://127.0.0.1:123/local/token/abc/'}
  const url=localEntryUrl(folder,'目录/a +.json')
  assert.equal(url,folder.baseUrl+'%E7%9B%AE%E5%BD%95/a%20%2B.json')
  assert.equal(localIdentity(folder,url),'local-folder:abc/%E7%9B%AE%E5%BD%95/a%20%2B.json')
  for(const entry of ['../a','/a','a//b','a\\b','a/./b','']) assert.throws(()=>localEntryUrl(folder,entry))
})
test('saved playback recipes reconnect local resources without rewriting remote references or other folders', () => {
  const old='http://127.0.0.1:123/local/old/abc/', next='http://127.0.0.1:456/local/new/abc/'
  const recipe={localRoot:{id:'abc',baseUrl:old},site:{jar:old+'a.jar;md5;abc',ext:old+'rules/a.json'},config:{url:old+'main.json',parses:[{url:'https://remote.example'}]}}
  const result=refreshLocalReferences(recipe,{id:'abc',baseUrl:next})
  assert.equal(result.site.jar,next+'a.jar;md5;abc');assert.equal(result.site.ext,next+'rules/a.json')
  assert.equal(result.config.parses[0].url,'https://remote.example');assert.equal(recipe.site.ext,old+'rules/a.json')
  assert.equal(refreshLocalReferences(recipe,{id:'other',baseUrl:next}),recipe)
})

test('browser folders preserve nested warehouse and rule paths without changing remote configuration semantics', () => {
  const base = BROWSER_LOCAL_ROOT + 'a'.repeat(32) + '/'
  const config = { urls: [{ name: '子配置', url: './目录/main.json' }], sites: [{ type: 1, api: './api.json', ext: 'rules/规则 +.txt' }], lives: [{ url: './live/频道.txt' }] }
  const result = parseConfig(config, base + 'warehouse.json')
  assert.equal(result.warehouses[0].url, base + '%E7%9B%AE%E5%BD%95/main.json')
  assert.equal(result.sites[0].ext, base + 'rules/%E8%A7%84%E5%88%99%20+.txt')
  assert.equal(result.lives[0].url, base + 'live/%E9%A2%91%E9%81%93.txt')
  assert.equal(parseConfig(config, 'https://remote.example/main.json').sites[0].ext, 'rules/规则 +.txt')
  assert.equal(isBrowserLocalUrl('https://localvideo-folder.invalid.evil.example/a'), false)
})

test('browser file routing rejects malformed folder ids and escaped separators before reading storage', async () => {
  for (const path of ['../private.json', 'invalid/main.json', 'a'.repeat(32) + '/rules%2f..%2fprivate.json', 'a'.repeat(32) + '/rules%5cprivate.json']) {
    await assert.rejects(requestBrowserTVBoxFile(BROWSER_LOCAL_ROOT + path))
  }
})
