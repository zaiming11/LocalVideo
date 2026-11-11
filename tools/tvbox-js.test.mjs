import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseConfig, resolveEpisode } from '../core/tvbox/engine.mjs'

test('Android JS spiders resolve engine and rule paths, preserve opaque playback, and stay disabled on Windows', async()=>{
  const input={sites:[{key:'douban',type:3,api:'./lib/drpy2.min.js',ext:'./lib/douban.js'}]}
  const url='http://47.96.82.41:5188/rose/18/xgg.json'
  const android=parseConfig(input,url,{android:true}),site=android.sites[0]
  assert.equal(site.supported,true);assert.equal(site.javascript,true);assert.equal(site.native,true)
  assert.equal(site.api,'http://47.96.82.41:5188/rose/18/lib/drpy2.min.js');assert.equal(site.ext,'http://47.96.82.41:5188/rose/18/lib/douban.js')
  assert.equal(parseConfig(input,url).sites[0].supported,false)
  assert.equal(parseConfig({sites:[{type:3,api:'https://example.com/spider.mjs?version=2'}]},url,{android:true}).sites[0].supported,true)
  const python=parseConfig({sites:[{type:3,api:'https://example.com/spider.py'}]},url,{android:true}).sites[0]
  assert.equal(python.supported,true);assert.equal(python.python,true);assert.equal(python.native,true)
  assert.match(parseConfig({sites:[{type:3,api:'https://example.com/spider.py'}]},url).sites[0].reason,/Python/)
  assert.match(parseConfig({sites:[{type:3,api:'csp_Test'}]},url,{android:true}).sites[0].reason,/JAR 地址/)
  const resolved=await resolveEpisode({site,config:android,url:'opaque-id',flag:'line'},()=>{throw new Error('Must use native JS')},async(selected,action,args)=>{
    assert.equal(selected.javascript,true);assert.equal(action,'play');assert.equal(args.url,'opaque-id')
    return {body:{parse:0,url:'https://example.com/video.m3u8',header:{Referer:'https://example.com/'}}}
  })
  assert.equal(resolved.hls,true);assert.equal(resolved.headers.Referer,'https://example.com/')
})

test('actual bundled JS runtime executes modules and the complete spider contract in isolated contexts',()=>{
  const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./check-js-spider.mjs',import.meta.url))],{encoding:'utf8',timeout:30000,windowsHide:true})
  assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message)
  assert.match(result.stdout,/isolation checks passed/)
})
