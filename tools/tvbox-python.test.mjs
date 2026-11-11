import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {parseConfig,resolveEpisode} from '../core/tvbox/engine.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
const {inspectElf}=createRequire(import.meta.url)('./python-elf.cjs')
test('both Python JNI artifacts use portable names, correct ARM ABIs, aligned segments and matching checksums',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'static/tvbox-python/runtime.json'),'utf8'))
  for(const [abi,bits,machine]of [['arm64-v8a',64,183],['armeabi-v7a',32,40]]){
    const bytes=fs.readFileSync(path.join(root,'static/tvbox-python',abi,'liblocalvideo_python.so')),elf=inspectElf(bytes)
    assert.equal(elf.bits,bits);assert.equal(elf.machine,machine);assert.deepEqual(elf.needed,['libpython3.11.so']);assert(elf.alignments.every(value=>value>=16384))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.jni[abi].sha256)
  }
})
test('Python Spider dispatch is Android-only and preserves extension paths and opaque playback IDs',async()=>{
  const raw={sites:[{key:'python',type:3,api:'./spider.py?version=1',ext:'./rules/settings.json'}]},url='https://example.com/config.json'
  const pc=parseConfig(raw,url);assert.equal(pc.sites[0].supported,false);assert.match(pc.sites[0].reason,/Python/)
  const config=parseConfig(raw,url,{android:true}),site=config.sites[0]
  assert.equal(site.python,true);assert.equal(site.native,true);assert.equal(site.supported,true)
  assert.equal(site.ext,'https://example.com/rules/settings.json')
  const video=await resolveEpisode({site,config,url:'opaque',flag:'line'},()=>{throw new Error('Must invoke Python')},async(s,action,args)=>{
    assert.equal(s.python,true);assert.equal(action,'play');assert.equal(args.url,'opaque')
    return {body:{url:'https://example.com/video.m3u8',parse:0,header:{Referer:'https://example.com/'}}}
  })
  assert.equal(video.hls,true);assert.equal(video.headers.Referer,'https://example.com/')
})
test('Python host runs real requests, isolates persistent caches and adapts the full TVBox protocol',{skip:!process.env.LOCALVIDEO_TEST_PYTHON||!fs.existsSync(process.env.LOCALVIDEO_TEST_PYTHON)},()=>{
  const result=spawnSync(process.env.LOCALVIDEO_TEST_PYTHON,['-B',path.join(root,'tools/fixtures/python_spider_check.py'),root],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:30000,windowsHide:true})
  assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message);assert.match(result.stdout,/missing-dependency checks passed/)
})
