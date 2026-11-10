import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import * as utils from '../core/utils.js'
import * as demo from '../core/demo.js'
import * as naturalSort from '../core/natural-sort.js'
import { resolveEpisode } from '../core/tvbox/engine.mjs'

const hxRequire = createRequire(path.join(process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins', 'uniapp-cli-vite/package.json'))
const vue = hxRequire('vue')
const esbuild = hxRequire('esbuild')
const source = fs.readFileSync(new URL('../core/store.js', import.meta.url), 'utf8').replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '')
const code = esbuild.transformSync(source, { format: 'cjs', target: 'es2020' }).code
const libraryKey = 'local_video_state_v1'
const checkpointKey = 'local_video_playback_checkpoint_v1'
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

// Exercise the actual recent-list lookup and click handlers with the real store.
const home = fs.readFileSync(new URL('../pages/home/home.vue', import.meta.url), 'utf8')
function recentPage(store) {
	const navigations = [], notices = [], showAddSheet = { value: false }
	const source = home.slice(home.indexOf('const recentEntries = computed('), home.indexOf('\nconst featured = computed('))
		+ home.slice(home.indexOf('function openVideo('), home.indexOf('\nfunction openFeatured('))
		+ home.slice(home.indexOf('function resumeEntry('), home.indexOf('\nasync function handlePrimaryImport('))
	const result = new Function('computed','state','getVideoById','paletteFor','relativeTime','filteredVideos','sortedVideos','setQueueForVideo','setCurrent','uni','showAddSheet','showToast','openAddSheet', source + '\nreturn { recentEntries, resumeEntry }')(
		vue.computed, store.state, store.getVideoById, utils.paletteFor, () => '', { value: store.state.videos }, { value: store.state.videos }, store.setQueueForVideo, store.setCurrent,
		{ navigateTo: value => navigations.push(value) }, showAddSheet, message => notices.push(message), () => { showAddSheet.value = true })
	return { ...result, navigations, notices, showAddSheet }
}

function fixture(t) {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const videos = Array.from({ length: 236 }, (_, index) => ({ id: `v${index}`, name: `第${index + 1}集.mp4`, title: `第 ${index + 1} 集`, url: `content://directory/videos/${index}`, folder: '剧集/第一季', duration: 120 }))
	const data = new Map([[libraryKey, { videos, progress: {}, history: [], settings: {} }]])
	const writes = []
	const options = { failRemove: false, failLibraryWrite: false }
	const uni = {
		getStorageSync: (key) => copy(data.get(key)),
		setStorageSync(key, value) {
			if (key === libraryKey && options.failLibraryWrite) throw new Error('Storage full')
			data.set(key, copy(value))
			writes.push({ key, bytes: Buffer.byteLength(JSON.stringify(value)), value: copy(value) })
		},
		removeStorageSync(key) { if (options.failRemove) throw new Error('Remove failed'); data.delete(key) }
	}
	const load = () => {
		const module = { exports: {} }
		new Function('require', 'module', 'exports', 'uni', code)((name) => {
			if (name === 'vue') return vue
			if (name === './utils.js') return utils
			if (name === './demo.js') return demo
			if (name === './natural-sort.js') return naturalSort
			throw new Error(`Unexpected import: ${name}`)
		}, module, module.exports, uni)
		module.exports.initStore()
		return module.exports
	}
	return { store: load(), load, data, writes, options }
}

test('periodic progress writes a bounded checkpoint and restores it after a cold start', (t) => {
	const { store, load, writes } = fixture(t)
	store.recordProgress(store.getVideoById('v0'), 31.5, 120)
	t.mock.timers.tick(351)
	assert.deepEqual(writes.map((write) => write.key), [checkpointKey])
	assert(writes[0].bytes < 512, `checkpoint should be small: ${writes[0].bytes}`)
	assert.equal(writes[0].value.videos, undefined)
	const restarted = load()
	assert.equal(restarted.state.videos.length, 236)
	assert.equal(restarted.getResumePosition(restarted.getVideoById('v0')), 31.5)
	assert.equal(restarted.state.history[0].name, '第1集.mp4')
	assert.equal(restarted.state.lastPlayedId, 'v0')
})

test('online queue persists separately without replacing local files and retains episode resolution data', (t) => {
	const { store, load } = fixture(t)
	const video = { id: 'tvbox-one', name: '在线第一集', url: 'https://example.com/raw', source: 'tvbox', online: { url: 'opaque-id', flag: 'default', site: { type: 4, api: 'https://example.com/api', supported: true }, config: { url: 'https://example.com/config' } } }
	store.setOnlineQueue([video], video.id)
	assert.equal(store.state.videos.length, 236)
	assert.equal(store.getVideoById(video.id).online.url, 'opaque-id')
	const restored = load()
	assert.deepEqual([...restored.state.queue], [video.id])
	assert.equal(restored.getVideoById(video.id).online.site.type, 4)
	assert.equal(restored.state.videos.length, 236)
})

test('TVBox recent entries remain playable after another title replaces the queue and after restart', async t => {
	const { store, load } = fixture(t)
	const video = { id:'tvbox_history', name:'历史影片', url:'opaque-episode', source:'tvbox', online: {
		url:'opaque-episode',flag:'line',site:{ key:'csp_Test',type:3,jar:'http://127.0.0.1:123/local/test.jar',ext:'http://127.0.0.1:123/local/rule.json',headers:{Referer:'https://example.com'} },
		config:{url:'http://127.0.0.1:123/local/main.json',flags:['line']},localRoot:{id:'folder',baseUrl:'http://127.0.0.1:123/local/',entry:'main.json'} } }
	store.setOnlineQueue([video],video.id);store.markPlayed(store.getVideoById(video.id));store.recordProgress(store.getVideoById(video.id),31,120)
	store.setOnlineQueue([{...video,id:'tvbox_another',name:'另一部影片'}],'tvbox_another')
	const restarted=load(), page=recentPage(restarted), entry=page.recentEntries.value.find(item=>item.id===video.id)
	assert(entry.video);assert.deepEqual(copy(entry.video.online),video.online)
	page.resumeEntry(entry)
	assert.deepEqual([...restarted.state.queue],[video.id]);assert.equal(restarted.state.currentId,video.id)
	assert.equal(restarted.getResumePosition(entry.video),31);assert.equal(restarted.state.videos.length,236)
	assert.deepEqual(page.navigations,[{url:'/pages/player/player?id=tvbox_history'}]);assert.equal(page.showAddSheet.value,false)
	const calls=[]
	const resolved=await resolveEpisode(restarted.getVideoById(video.id).online,async()=>{throw Error('Unexpected HTTP API')},async(site,action,args)=>{
		calls.push({site,action,args});return {body:{url:'https://example.com/fresh.mp4',parse:0}}
	})
	assert.equal(resolved.url,'https://example.com/fresh.mp4');assert.equal(calls[0].action,'play');assert.equal(calls[0].args.url,'opaque-episode')
	assert.equal(calls[0].site.ext,video.online.site.ext);assert.deepEqual(page.notices,[])
})

test('recent TVBox resumes the active episode queue and upgrades legacy records before queue replacement', t => {
	const {store,load}=fixture(t)
	const videos=[1,2].map(n=>({id:'tvbox_'+n,name:'第'+n+'集',url:'https://example.com/'+n+'.mp4',source:'tvbox',online:{url:'https://example.com/'+n+'.mp4',site:null,config:{url:'https://example.com/config'}}}))
	store.setOnlineQueue(videos,videos[0].id)
	store.state.history=[{id:videos[0].id,title:videos[0].name,position:12,duration:120}]
	const page=recentPage(store);page.resumeEntry(page.recentEntries.value[0])
	assert.deepEqual([...store.state.queue],videos.map(v=>v.id));assert.equal(page.navigations.length,1)
	store.setOnlineQueue([{...videos[0],id:'tvbox_new'}],'tvbox_new')
	assert.equal(load().getVideoById(videos[0].id).online.url,videos[0].url)
	store.setQueueForVideo(store.getVideoById('v1'),store.state.videos)
	assert.equal(store.state.queue.length,236);assert(!store.state.queue.some(id=>id.startsWith('tvbox_')))
})

test('unrecoverable old TVBox history shows a TVBox-specific message instead of opening local import', t => {
	const {store}=fixture(t)
	store.state.history=[{id:'tvbox_old',title:'旧影片',position:12,duration:120}]
	const page=recentPage(store);page.resumeEntry(page.recentEntries.value[0])
	assert.equal(page.navigations.length,0);assert.equal(page.showAddSheet.value,false)
	assert.match(page.notices[0],/从 TVBox 重新打开/)
})

test('a full save includes current progress and stale checkpoints cannot undo clearing history', (t) => {
	const { store, load, data, options } = fixture(t)
	store.recordProgress(store.getVideoById('v0'), 22, 120)
	t.mock.timers.tick(351)
	options.failRemove = true
	store.saveState({ immediate: true })
	assert.equal(data.get(libraryKey).progress.v0.position, 22)
	assert.equal(load().getResumePosition(load().getVideoById('v0')), 22)
	store.state.progress = {}
	store.state.history = []
	store.state.lastPlayedId = ''
	store.saveState({ immediate: true })
	const restarted = load()
	assert.equal(restarted.getProgress('v0'), null)
	assert.deepEqual([...restarted.state.history], [])
})

test('episode switching flushes both records and library removal invalidates the lookup index', (t) => {
	const { store, load } = fixture(t)
	store.recordProgress(store.getVideoById('v0'), 42, 120)
	store.setCurrent('v1')
	store.markPlayed(store.getVideoById('v1'))
	store.recordProgress(store.getVideoById('v1'), 7, 120)
	t.mock.timers.tick(351)
	const restarted = load()
	assert.equal(restarted.getProgress('v0').position, 42)
	assert.equal(restarted.getProgress('v1').position, 7)
	store.removeVideo('v1')
	assert.equal(store.getVideoById('v1'), null)
	assert.equal(load().getVideoById('v1'), null)
})

test('failed library writes do not invalidate the latest durable checkpoint', (t) => {
	const { store, load, options } = fixture(t)
	store.recordProgress(store.getVideoById('v0'), 36, 120)
	t.mock.timers.tick(351)
	options.failLibraryWrite = true
	assert.equal(store.saveState({ immediate: true }), false)
	assert.equal(load().getProgress('v0').position, 36)
})

test('library and playback queues receive natural filename order with ascending and descending settings', (t) => {
	const { store } = fixture(t)
	const { sortedVideos } = store.useVideoStore()
	assert.deepEqual(sortedVideos.value.slice(0, 11).map((video) => video.name), Array.from({ length: 11 }, (_, i) => `第${i + 1}集.mp4`))
	store.setSetting('sortDir', 'desc')
	assert.equal(sortedVideos.value[0].name, '第236集.mp4')
	assert.equal(sortedVideos.value.at(-1).name, '第1集.mp4')
})
