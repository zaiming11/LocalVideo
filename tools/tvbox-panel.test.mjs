import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as engine from '../core/tvbox/engine.mjs'
import * as selection from '../core/tvbox/selection.mjs'
import * as localReference from '../core/tvbox/local-reference.mjs'
import { createSwipeBack } from '../core/swipe-back.mjs'
const hx = createRequire(path.join(process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins', 'uniapp-cli-vite/package.json'))
const vue = hx('vue'), compiler = hx('@vue/compiler-sfc'), esbuild = hx('esbuild')
const KEY = 'localvideo_tvbox_config_v1'
const url = 'https://fixture.example/config.json'
const config = { sites: [{ key: 'a', name: 'Alpha', type: 1, api: 'https://fixture.example/a' }, { key: 'b', name: 'Beta', type: 1, api: 'https://fixture.example/b' }], lives: [{ name: 'News', url: 'https://fixture.example/live.m3u' }] }
const compiled = compiler.compileScript(compiler.parse(fs.readFileSync(new URL('../components/TVBoxPanel.vue', import.meta.url), 'utf8')).descriptor, { id: 'tvbox-panel-test', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => ['view','text','input','image','scroll-view'].includes(tag) } } })
const code = esbuild.transformSync(compiled.content, { format: 'cjs' }).code
globalThis.document = { activeElement: null }
const flush = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); await vue.nextTick() } }
function mount(storage, props = {}, responses = {}, localFiles = {}) {
  const requests = [], errors = [], clone = value => value === undefined ? '' : JSON.parse(JSON.stringify(value))
  const uni = { getStorageSync: key => clone(storage.get(key)), setStorageSync: (key,value) => storage.set(key,clone(value)) }
  const modules = {
    vue,
    '../core/tvbox/engine.mjs': engine,
    '../core/tvbox/selection.mjs': selection,
    '../core/tvbox/local-reference.mjs': localReference,
    '../core/tvbox/local-files.js': { canImportTVBoxFolder: () => true, pickTVBoxFolder: async () => null, restoreTVBoxFolder: async () => { throw Error('文件夹权限已失效') }, ...localFiles },
    '../core/swipe-back.mjs': { createSwipeBack },
    '../core/store.js': { setOnlineQueue() {} },
    '../core/tvbox/client.js': {
      hasAndroidEngine: () => false, tvboxMediaUrl: value => value, resolveTVBoxVideo: async () => ({}),
      requestTVBox: async address => {
        requests.push(address)
        if (address.endsWith('.m3u')) return { body: '#EXTM3U\n#EXTINF:-1,News\nhttps://fixture.example/video.mp4', url: address }
        if (!responses[address]) throw Error('Unexpected request ' + address)
        return { body: responses[address].body || responses[address], url: responses[address].url || address }
      },
      requestTVBoxSite: async (site, action) => { requests.push(site.key + ':' + action); return { url: site.api, body: { class: [{ type_id:'1',type_name:'Movies' }], list: [{ vod_id:site.key,vod_name:site.name,vod_play_url:'Episode$https://fixture.example/video.mp4' }] } } }
    }
  }
  const module = { exports: {} }
  const resourcePicker = { props: ['modelValue','displayValue'], emits: ['update:modelValue'], setup: (_, { emit }) => () => vue.h('button', { onClick: () => emit('update:modelValue', url) }, '选择测试网络资源') }
  new Function('require','module','exports','uni',code)(name => name === './TVBoxResourcePicker.vue' ? resourcePicker : name.endsWith('.vue') ? { render: () => null } : modules[name] || (()=>{throw Error('Unexpected import '+name)})(), module,module.exports,uni)
  const node = (tag,text='') => ({ tag,text,props:{},style:{},children:[],parent:null,value:'',addEventListener(){},removeEventListener(){} })
  const renderer = vue.createRenderer({
    createElement: tag=>node(tag),createText:text=>node('#text',text),createComment:text=>node('#comment',text),
    setText:(el,text)=>el.text=text,setElementText:(el,text)=>{el.text=text;el.children=[]},patchProp:(el,key,old,value)=>el.props[key]=value,
    insert(el,parent,anchor){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1);el.parent=parent;const i=anchor?parent.children.indexOf(anchor):-1;if(i<0)parent.children.push(el);else parent.children.splice(i,0,el)},
    remove(el){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1)},parentNode:el=>el.parent,nextSibling:el=>el.parent?.children[el.parent.children.indexOf(el)+1]||null
  })
  const root=node('root'),app=renderer.createApp(module.exports.default || module.exports,props);app.config.errorHandler=e=>errors.push(e.message)
  app.component('scroll-view', { setup: (_, { attrs, slots }) => () => vue.h('scroll-view', attrs, slots.default?.()) })
  const instance=app.mount(root)
  const all=()=>{const found=[];const visit=el=>{found.push(el);el.children.forEach(visit)};visit(root);return found}
  const text=el=>el.text+el.children.map(text).join('')
  const hasClass=(el,name)=>String(el.props.class||'').split(' ').includes(name)
  return { app,instance,requests,errors,all,text,hasClass,button:(label)=>all().find(el=>el.tag==='button'&&text(el)===label), open: async kind => { const buttons=all().filter(el=>hasClass(el,'select-button')); buttons[kind==='warehouse'?0:buttons.length-1].props.onClick(); await flush() }, choose:async label=>{const button=all().find(el=>el.tag==='button'&&text(el).startsWith(label));assert(button,'Missing '+label);button.props.onClick();await flush()} }
}
test('site/live choice survives unmount and list reordering; menus target the selected row', async () => {
  const storage=new Map([[KEY,{url,body:structuredClone(config),resourceUrl:url}]])
  let panel=mount(storage);await flush();await panel.open('source');await panel.choose('Beta')
  assert.equal(panel.requests.at(-1),'b:home');panel.app.unmount()
  const stored=storage.get(KEY);stored.body.sites.reverse()
  panel=mount(storage);await flush();assert.equal(panel.requests.at(-1),'b:home')
  await panel.open('source')
  const selected=panel.all().find(el=>el.tag==='button'&&panel.hasClass(el,'selected'))
  assert.equal(panel.all().find(el=>el.tag==='scroll-view').props['scroll-into-view'],selected.props.id)
  await panel.choose('News');panel.app.unmount()
  panel=mount(storage);await flush();assert(panel.requests.includes('https://fixture.example/live.m3u'));assert(!panel.requests.some(x=>x.endsWith(':home')))
  assert.deepEqual(panel.errors,[]);panel.app.unmount()
})
test('warehouse choice survives redirects and retains a separate source selection per warehouse', async () => {
  const root='https://fixture.example/root',a='https://fixture.example/one',b='https://fixture.example/two'
  const warehouses=[{name:'One',url:a},{name:'Two',url:b}]
  const storage=new Map([[KEY,{url:root,body:{urls:warehouses},resourceUrl:root}],[KEY+'_selection_v1',{warehouses:{[root]:b},sources:{[b]:selection.sourceIdentity(config.sites[1])}}]])
  const responses={ [a]:config,[b]:{body:config,url:'https://cdn.example/redirected.json'} }
  let panel=mount(storage,{},responses);await flush();assert.equal(panel.requests[0],b);assert.equal(panel.requests.at(-1),'b:home')
  await panel.open('warehouse');await panel.choose('One');assert.equal(panel.requests.at(-1),'a:home')
  await panel.open('warehouse');await panel.choose('Two');assert.equal(panel.requests.at(-1),'b:home');panel.app.unmount()
  panel=mount(storage,{},responses);await flush();assert.equal(panel.requests.at(-1),'b:home');assert(!panel.requests.includes(a));assert(!panel.requests.includes(b))
  assert(panel.all().some(el=>panel.text(el)==='仓库 · Two'));assert.deepEqual(panel.errors,[]);panel.app.unmount()
})
test('returning from detail keeps the current list and settings restore an unapplied resource draft', async () => {
  const storage=new Map([[KEY,{url,body:structuredClone(config),resourceUrl:url}],[KEY+'_draft',{value:'https://draft.example/config.json'}]])
  let panel=mount(storage);await flush()
  panel.all().find(el=>panel.hasClass(el,'card')).props.onClick();await flush()
  assert(panel.all().some(el=>panel.hasClass(el,'detail-head')))
  const count=panel.requests.length;assert.equal(panel.instance.handleBack(),true);await flush();assert.equal(panel.requests.length,count)
  assert(panel.all().some(el=>panel.hasClass(el,'cards')));assert.equal(panel.instance.handleBack(),false);panel.app.unmount()
  panel=mount(storage,{mode:'settings'});await flush()
  assert.equal(panel.all().find(el=>el.tag==='input').value,'https://draft.example/config.json')
  assert.equal(storage.get(KEY).resourceUrl,url);assert.deepEqual(panel.errors,[]);panel.app.unmount()
})

test('folder import waits for explicit selection; persistent dropdown switches and restores selection and scroll target', async () => {
  const folder=Object.freeze({id:'abc',name:'本地资源',baseUrl:'http://127.0.0.1:100/local/old/abc/',candidates:Object.freeze([{path:'2.json'},{path:'1.json'}])})
  const storage=new Map(), responses={ [folder.baseUrl+'1.json']:config,[folder.baseUrl+'2.json']:config }
  let panel=mount(storage,{mode:'settings'},responses,{pickTVBoxFolder:async()=>folder})
  await flush();await panel.choose('加载本地配置文件夹')
  assert.equal(storage.has(KEY),false);assert.deepEqual(panel.requests,[])
  assert(!panel.all().some(el=>panel.hasClass(el,'local-selected')))
  await panel.choose('1.json')
  assert.equal(storage.get(KEY).localRoot.entry,'1.json')
  panel.all().find(el=>panel.hasClass(el,'local-config-select')).props.onClick();await flush()
  await panel.choose('2.json');assert.equal(storage.get(KEY).localRoot.entry,'2.json');panel.app.unmount()
  const restored={...folder,baseUrl:'http://127.0.0.1:200/local/new/abc/'}
  panel=mount(storage,{mode:'settings'},{},{restoreTVBoxFolder:async()=>restored});await flush()
  assert(panel.all().some(el=>panel.hasClass(el,'local-config-select') && panel.text(el).startsWith('2.json')))
  panel.all().find(el=>panel.hasClass(el,'local-config-select')).props.onClick();await flush()
  const selected=panel.all().find(el=>panel.hasClass(el,'local-selected'))
  assert.equal(panel.all().find(el=>panel.hasClass(el,'local-config-list')).props['scroll-into-view'],selected.props.id)
  assert.equal(panel.instance.handleBack(),true);assert.deepEqual(panel.errors,[]);panel.app.unmount()
})

test('local warehouses and live choice survive restart without reusing old port/token', async () => {
  const folder={id:'abc',name:'本地资源',baseUrl:'http://127.0.0.1:200/local/new/abc/',candidates:[{path:'root.json'}]}
  const canonical='local-folder:abc/', root=folder.baseUrl+'root.json', child=folder.baseUrl+'child.json'
  const storage=new Map([[KEY,{url:'http://127.0.0.1:100/old/child.json',body:config,resourceUrl:canonical+'root.json',localRoot:{id:'abc',name:'本地资源',entry:'root.json'}}],
    [KEY+'_selection_v1',{warehouses:{[canonical+'root.json']:canonical+'child.json'},sources:{[canonical+'child.json']:selection.sourceIdentity({url:canonical+'live.m3u'},true)}}]])
  const responses={[root]:{urls:[{name:'One',url:'./first.json'},{name:'Two',url:'./child.json'}]},[child]:{...config,lives:[{name:'Local Live',url:'./live.m3u'}]}}
  const panel=mount(storage,{},responses,{restoreTVBoxFolder:async()=>folder});await flush()
  assert.deepEqual(panel.requests,[root,child,folder.baseUrl+'live.m3u'])
  assert.equal(storage.get(KEY).localRoot.entry,'root.json');assert.deepEqual(panel.errors,[]);panel.app.unmount()
})

test('folder cancellation and revoked permission preserve the applied config and saved draft', async () => {
  const draft={value:'local-folder:abc/main.json',localRoot:{id:'abc',name:'资源',entry:'main.json'}}
  const applied={url,body:config,resourceUrl:url},storage=new Map([[KEY,applied],[KEY+'_draft',draft]])
  const panel=mount(storage,{mode:'settings'});await flush()
  assert(panel.all().some(el=>panel.text(el)==='文件夹权限已失效'))
  assert.deepEqual(storage.get(KEY+'_draft'),draft)
  await panel.choose('加载本地配置文件夹');assert.deepEqual(storage.get(KEY),applied);assert.deepEqual(panel.errors,[]);panel.app.unmount()
})

test('network selection clears the local highlight and a loaded folder never replaces the network config on remount', async () => {
  const folder={id:'abc',name:'资源',baseUrl:'http://127.0.0.1:100/local/token/abc/',candidates:[{path:'main.json'}]}
  const storage=new Map([[KEY,{url,body:config,resourceUrl:url}]])
  const adapters={pickTVBoxFolder:async()=>folder,restoreTVBoxFolder:async()=>folder}
  let panel=mount(storage,{mode:'settings'},{[folder.baseUrl+'main.json']:config,[url]:config},adapters)
  await flush();await panel.choose('加载本地配置文件夹')
  assert.equal(storage.get(KEY).resourceUrl,url);assert.deepEqual(panel.requests,[])
  await panel.choose('main.json');assert.equal(storage.get(KEY).localRoot.entry,'main.json')
  await panel.choose('选择测试网络资源')
  assert(panel.all().some(el=>panel.hasClass(el,'local-config-select')&&panel.text(el).startsWith('选择本地主配置')))
  panel.all().find(el=>panel.hasClass(el,'local-config-select')).props.onClick();await flush()
  assert(!panel.all().some(el=>panel.hasClass(el,'local-selected')));panel.instance.handleBack();await flush()
  await panel.choose('导入配置');assert.equal(storage.get(KEY).localRoot,undefined);panel.app.unmount()
  panel=mount(storage,{mode:'settings'},{},adapters);await flush()
  assert(panel.all().some(el=>panel.hasClass(el,'local-config-select')&&panel.text(el).startsWith('选择本地主配置')))
  assert.equal(panel.all().find(el=>el.tag==='input').value,url);assert.deepEqual(panel.requests,[])
  assert.deepEqual(panel.errors,[]);panel.app.unmount()
})

test('a saved TXT playlist opens its live channel list through the standard resource import flow', async () => {
  const playlistUrl='https://fixture.example/live.txt'
  const playlist='新闻,#genre#\n频道一,https://fixture.example/one.m3u8\n频道二,https://fixture.example/two.m3u8'
  const storage=new Map([[KEY+'_draft',{value:playlistUrl}]])
  let panel=mount(storage,{mode:'settings'},{[playlistUrl]:playlist});await flush()
  await panel.choose('导入配置');assert.equal(storage.get(KEY).body,playlist);assert.deepEqual(panel.errors,[]);panel.app.unmount()
  panel=mount(storage,{}, {[playlistUrl]:playlist});await flush()
  assert.deepEqual(panel.requests,[playlistUrl])
  assert.equal(panel.all().filter(el=>panel.hasClass(el,'card')).length,2)
  assert(panel.all().some(el=>panel.text(el)==='直播频道'));assert.deepEqual(panel.errors,[]);panel.app.unmount()
})
