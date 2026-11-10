import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'

const require=createRequire(path.join(process.env.UNI_HBUILDERX_PLUGINS||'E:/HBuilderX/plugins','uniapp-cli-vite/package.json'))
const vue=require('vue')
const source=fs.readFileSync(new URL('../pages/player/player.vue',import.meta.url),'utf8')
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))
const h5=text=>{
  const conditions=[]
  return text.split('\n').filter(line=>{
    const directive=line.match(/\/\/\s*#(ifdef|ifndef|endif)\s*([\w-]*)/)
    if(!directive)return conditions.every(Boolean)
    if(directive[1]==='endif')conditions.pop()
    else conditions.push(directive[1]==='ifdef'?directive[2]==='H5':directive[2]!=='H5')
    return false
  }).join('\n')
}
const functions=h5(section('function toggleFullscreen()', 'function onVisibilityChange()'))
  +section('function onH5LoadedMetadata()', 'function onH5TimeUpdate()')
const direction=source.split('\n').find(line=>line.startsWith('const fullscreenDirection ='))
const watcher=section('watch(fullscreenDirection,','watch([showMoreSheet,').replace('watch(','const stopWatching = watch(')
const flush=async()=>{await Promise.resolve();await vue.nextTick();await Promise.resolve()}

function player(t,{size={width:1080,height:1920},lockSupported=true}={}){
  const calls={locks:[],unlocks:0,requests:0,notices:[]}
  const document={fullscreenElement:null,exitFullscreen:async()=>{document.fullscreenElement=null}}
  const screen={orientation:{lock:async direction=>{calls.locks.push(direction);if(!lockSupported)throw Error('Unsupported')},unlock:()=>calls.unlocks++}}
  const shell={requestFullscreen:async()=>{calls.requests++;document.fullscreenElement=shell}}
  const video={videoWidth:size.width,videoHeight:size.height,duration:120}
  const script=`
    const isFullscreen=ref(false),showMoreSheet=ref(false),showControls=ref(true),appFullscreen=ref(false),appScreenLocked=ref(false),isDesktopVlc=false;
    const duration=ref(0),loading=ref(true),volume=ref(1),muted=ref(false),rate=ref(1);
    let sourceChanging=false,pendingSeek=0;
    const scheduleHide=()=>{},showResumeHint=()=>{};
    ${direction}\n${functions}\n${watcher}
    return {toggleFullscreen,requestPlayerFullscreen,onFullscreenChange,onH5LoadedMetadata,stopWatching};`
  const api=new Function('ref','computed','watch','current','videoEl','shellRef','document','screen','showToast','clamp',script)(
    vue.ref,vue.computed,vue.watch,vue.ref({duration:120}),video,vue.ref(shell),document,screen,message=>calls.notices.push(message),(value,min,max)=>Math.max(min,Math.min(max,value)))
  t.after(api.stopWatching)
  return {api,calls,video,document}
}

test('browser fullscreen follows the chosen direction and releases orientation on exit',async t=>{
  const p=player(t)
  p.api.onH5LoadedMetadata();p.api.requestPlayerFullscreen('portrait');await flush();p.api.onFullscreenChange()
  assert.equal(p.calls.locks.at(-1),'portrait')
  p.video.videoWidth=1920;p.video.videoHeight=1080;p.api.onH5LoadedMetadata();await flush()
  assert.equal(p.calls.locks.at(-1),'portrait');p.api.requestPlayerFullscreen('landscape');await flush();assert.equal(p.calls.locks.at(-1),'landscape');assert.equal(p.calls.requests,1)
  p.api.toggleFullscreen();await flush();p.api.onFullscreenChange()
  assert.equal(p.calls.unlocks,1);assert.deepEqual(p.calls.notices,[])
})

test('explicit portrait selection does not depend on metadata or browser lock support',async t=>{
  const p=player(t,{size:{width:0,height:0},lockSupported:false})
  p.api.onH5LoadedMetadata();p.api.requestPlayerFullscreen('portrait');await flush();p.api.onFullscreenChange()
  assert.equal(p.calls.locks.at(-1),'portrait');assert(p.document.fullscreenElement)
  assert.deepEqual(p.calls.notices,[])
})
