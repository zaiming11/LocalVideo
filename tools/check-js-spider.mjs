// Isolated JS-module contract checks. Invoked with --experimental-vm-modules.
import vm from 'node:vm'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'

const assets = new URL('../static/tvbox-js/', import.meta.url)
export async function createHost({ sources, api, ext = '', request }) {
  const completed = new Map(), storage = new Map(), context = vm.createContext({ URL, console: {log(){}}, setTimeout, clearTimeout, TextEncoder, TextDecoder, crypto:webcrypto, atob, btoa })
  const modules = new Map()
  function moduleFor(specifier, parent = new URL('runtime.js', assets).href) {
    if(specifier.startsWith('assets://js/lib/')) specifier = new URL(specifier.endsWith('cheerio.min.js') ? 'cheerio.js' : 'crypto-js.js', assets).href
    const identifier = new URL(specifier,parent).href
    if(modules.has(identifier)) return modules.get(identifier)
    const source = identifier.startsWith(assets.href) ? fs.readFileSync(fileURLToPath(identifier),'utf8') : sources[identifier]
    if(source == null) throw new Error('Missing test module: '+identifier)
    const module = new vm.SourceTextModule(source,{context,identifier,importModuleDynamically:async(spec,referencing)=>{
      const imported=moduleFor(spec,referencing.identifier)
      if(imported.status==='unlinked')await imported.link((child,ref)=>moduleFor(child,ref.identifier))
      if(imported.status==='linked')await imported.evaluate({timeout:5000})
      return imported
    }})
    modules.set(identifier,module);return module
  }
  const runtime=moduleFor(new URL('runtime.js',assets).href)
  await runtime.link((specifier,parent)=>moduleFor(specifier,parent.identifier));await runtime.evaluate({timeout:5000})
  await runtime.namespace.start({api,ext,proxy:'http://127.0.0.1:1234/proxy?do=js&js=fixture'}, {
    complete:(id,value,error)=>completed.set(id,{value:JSON.parse(value),error}),
    request:(url,options)=>JSON.stringify(request(url,JSON.parse(options))),
    storage:(action,namespace,key,value)=>{const name=namespace+'\0'+key;if(action==='set')storage.set(name,value);else if(action==='delete')storage.delete(name);return storage.get(name)||''}
  })
  assert.equal(completed.get('ready')?.error,'',completed.get('ready')?.error)
  return {context,invoke:async(action,args={})=>{const id='case-'+completed.size;await context.__localvideoInvoke(id,action,args);const result=completed.get(id);if(result.error)throw new Error(result.error);return result.value}}
}

async function check() {
  const api='https://fixture.test/js/spider.js'
  const source=`import {prefix} from './shared.js';
    export function __jsEvalReturn(){return {
      async init(ext){local.set('fixture','ext',ext);},
      home(){return JSON.stringify({class:[{type_id:'1',type_name:'分类'}]});},
      async homeVod(){return {list:[{vod_id:'vod-1',vod_name:prefix+'推荐'}]};},
      category(id,page,filter,extend){const html=req('../list',{headers:{Referer:'https://fixture.test/'}}).content;return {page,pagecount:3,list:pdfa(html,'a').map(row=>({vod_id:pd(row,'a&&href','https://fixture.test/'),vod_name:pdfh(row,'a&&Text')}))};},
      search(word,quick,page){return {page,list:[{vod_id:word,vod_name:local.get('fixture','ext')}]};},
      detail(id){return {list:[{vod_id:id,vod_play_from:'线路',vod_play_url:'第1集$opaque'}]};},
      play(flag,id,flags){return JSON.stringify({parse:0,url:'https://fixture.test/video.mp4',header:{Referer:flags[0]},token:md5(id)});},
      proxy(args){return [200,'text/plain',args.value,{'X-Fixture':'1'}];}
    }};`
  const requests=[]
  const host=await createHost({api,ext:'设置',sources:{[api]:source,'https://fixture.test/js/shared.js':"export const prefix='模块';"},request:(url,options)=>{requests.push({url,options});return {code:200,headers:{},content:'<a href="/film/1">片名 &amp; 推荐</a>'}}})
  assert.equal((await host.invoke('home')).list[0].vod_name,'模块推荐')
  const page=await host.invoke('category',{id:'1',page:2})
  assert.equal(page.page,2);assert.equal(page.list[0].vod_id,'https://fixture.test/film/1');assert.equal(page.list[0].vod_name,'片名 & 推荐')
  assert.equal(requests[0].url,'https://fixture.test/list');assert.equal(requests[0].options.headers.Referer,'https://fixture.test/')
  assert.equal((await host.invoke('search',{keyword:'片名',page:3})).list[0].vod_name,'设置')
  assert.equal((await host.invoke('detail',{id:'vod-1'})).list[0].vod_play_url,'第1集$opaque')
  assert.equal((await host.invoke('play',{url:'opaque',flags:['referer']})).header.Referer,'referer')
  assert.deepEqual(await host.invoke('proxy',{value:'proxy body'}),[200,'text/plain','proxy body',{'X-Fixture':'1'}])
  const other=await createHost({api,ext:'独立配置',sources:{[api]:source,'https://fixture.test/js/shared.js':"export const prefix='模块';"},request:()=>({})})
  assert.equal((await other.invoke('search',{keyword:'片名'})).list[0].vod_name,'独立配置')
  assert.equal((await host.invoke('search',{keyword:'片名'})).list[0].vod_name,'设置')
  // Exercise the exact drpy format: default export, built-in assets, Jinja2,
  // JSONPath, AES/HMAC and an external rule passed through req().
  const drpyApi='https://fixture.test/lib/drpy.js',rule='https://fixture.test/rule.js'
  const drpy=await createHost({api:drpyApi,ext:rule,sources:{[drpyApi]:`
    import parser from 'assets://js/lib/cheerio.min.js';import 'assets://js/lib/crypto-js.js';
    let name='';export default {init(ext){name=req(ext).content;},home(){return {class:[{type_id:'1',type_name:parser.jinja2('{{name}}',{name})}]};},
    category(){return {list:[{vod_id:'1',vod_name:parser.jp('$.name',{name:'JSONPath'})[0],vod_remarks:CryptoJS.HmacSHA1('value','key').toString()}]};}};`
  },request:url=>{assert.equal(url,rule);return {content:'drpy 规则'}}})
  assert.equal((await drpy.invoke('home')).class[0].type_name,'drpy 规则')
  assert.equal((await drpy.invoke('category')).list[0].vod_name,'JSONPath')
  const broken=await createHost({api,ext:'',sources:{[api]:`export default {init(){},home(){return {class:[{type_id:'1',type_name:'分类'}]};},homeVod(){req('/gone');return {list:[]};},category(){req('/gone');return {list:[{vod_id:'no_data',vod_name:'无数据,防无限请求'}]};}}`},request:()=>({code:404,content:'<html>Not found</html>'})})
  assert.match((await broken.invoke('home')).sourceWarning,/HTTP 404/)
  await assert.rejects(()=>broken.invoke('category'),/HTTP 404/)
  console.log('JS Spider module, drpy dependencies, request, category/search/detail/play/proxy and isolation checks passed')
}
if(process.argv[1]===fileURLToPath(import.meta.url))await check()
