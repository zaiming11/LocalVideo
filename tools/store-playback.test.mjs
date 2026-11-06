import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import * as utils from '../core/utils.js'
import * as demo from '../core/demo.js'
import * as naturalSort from '../core/natural-sort.js'

const hxRequire = createRequire(path.join(process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins', 'uniapp-cli-vite/package.json'))
const vue = hxRequire('vue')
const esbuild = hxRequire('esbuild')
const source = fs.readFileSync(new URL('../core/store.js', import.meta.url), 'utf8').replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '')
const code = esbuild.transformSync(source, { format: 'cjs', target: 'es2020' }).code
const libraryKey = 'local_video_state_v1'
const checkpointKey = 'local_video_playback_checkpoint_v1'
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

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
