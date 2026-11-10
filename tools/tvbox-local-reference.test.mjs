import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localEntryUrl, localIdentity, refreshLocalReferences } from '../core/tvbox/local-reference.mjs'

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
