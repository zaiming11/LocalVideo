import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createSwipeBack } from '../core/swipe-back.mjs'
import * as fullscreenLayout from '../core/fullscreen-layout.mjs'

// HBuilder projects use the Vue/compiler runtime shipped with the IDE.
const hxRequire = createRequire(path.join(process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins', 'uniapp-cli-vite/package.json'))
const vue = hxRequire('vue')
const compiler = hxRequire('@vue/compiler-sfc')
const esbuild = hxRequire('esbuild')

function appSource(source) {
	const conditions = []
	return source.split('\n').filter((line) => {
		const directive = line.match(/(?:<!--|\/\/)\s*#(ifdef|ifndef|endif)\s*([\w-]*)/)
		if (!directive) return conditions.every(Boolean)
		if (directive[1] === 'endif') conditions.pop()
		else {
			const matches = directive[2] === 'APP-PLUS'
			conditions.push(directive[1] === 'ifdef' ? matches : !matches)
		}
		return false
	}).join('\n')
}

const descriptor = compiler.parse(appSource(fs.readFileSync(new URL('../pages/player/player.vue', import.meta.url), 'utf8'))).descriptor
const compiled = compiler.compileScript(descriptor, {
	id: 'player-test',
	inlineTemplate: true,
	templateOptions: { compilerOptions: { isCustomElement: (tag) => ['view', 'text', 'video', 'cover-view', 'image', 'scroll-view', 'slider'].includes(tag) } }
})
const componentCode = esbuild.transformSync(compiled.content, { format: 'cjs', target: 'es2020' }).code

async function mountPlayer(t, queueSize = 1, resumePosition = 0, presentation = {}) {
	const native = { fullscreen: false, orientations: [], pauses: 0, videoCreated: 0, videoRemoved: 0, videoStyleUpdates: 0, progress: [], seeks: [], errors: [], backCalls: 0 }
	Object.assign(native, { volume: 0.5, brightness: 0.6, brightnessRestores: 0, brightnessResumes: 0 })
	const video = { id: 'test-video', title: 'Test video', name: 'test.mp4', url: 'content://media/test', duration: 120, ...presentation.video }
	const videos = Array.from({ length: queueSize }, (_, index) => index ? { ...video, id: `test-video-${index}` } : video)
	const state = vue.reactive({ videos, queue: videos.map((item) => item.id), currentId: video.id, progress: {}, settings: { autoNext: false, rememberProgress: false, defaultRate: 1, volume: 1, fullscreenFill: false } })
	const store = {
		state, initStore() {}, markPlayed() {}, recordProgress: (...args) => native.progress.push(args), saveState() {}, showToast() {},
		getResumePosition: () => resumePosition, getVideoById: (id) => state.videos.find((item) => item.id === id) || null, progressPercent: () => 0,
		setCurrent: (id) => { state.currentId = id }, setQueue: (ids) => { state.queue = ids },
		setSetting: (key, value) => { state.settings[key] = value },
		useVideoStore: () => ({ sortedVideos: vue.computed(() => state.videos) })
	}
	const hooks = { back: null }
	const lifecycle = { onLoad: (fn) => fn({ id: video.id }), onHide: (fn) => { hooks.hide = fn }, onShow: (fn) => { hooks.show = fn }, onUnload() {}, onPageScroll() {}, onBackPress: (fn) => { hooks.back = fn } }
	const utils = { clamp: (n, min, max) => Math.max(min, Math.min(max, n)), extLabel: () => 'MP4', formatBytes: () => '1 MB', formatDate: () => '', formatDuration: (value) => String(value || 0), isApp: () => true, isH5: () => false }
	const plus = { navigator: { isFullscreen: () => native.fullscreen, setFullscreen: (value) => { native.fullscreen = value } }, screen: { lockOrientation: (value) => native.orientations.push(value), unlockOrientation: () => native.orientations.push('unlocked') } }
	const uni = { getSystemInfoSync: () => ({ windowWidth: 400, windowHeight: 800 }), showActionSheet: (menu) => { native.menu = menu }, onWindowResize() {}, offWindowResize() {}, createVideoContext: () => ({ pause: () => native.pauses++, play() {}, seek: (value) => { assert(Number.isInteger(value), 'Android native seek requires integer seconds'); native.seeks.push(value) }, playbackRate() {} }), navigateBack() { native.backCalls++ } }
	const mockComponent = { render: () => null }
	const mockVlc = { setup(_, { attrs, expose }) { expose({ pause: () => native.pauses++, play() {}, seek: value => native.seeks.push(value), playbackRate() {}, visible() {}, retry() {}, refreshLayout() {}, release() {} }); return () => vue.h('video', attrs) } }
	const requireModule = (name) => {
		if (name === 'vue') return vue
		if (name === '@dcloudio/uni-app') return lifecycle
		if (name.endsWith('store.js')) return store
		if (name.endsWith('utils.js')) return utils
		if (name.endsWith('media.js')) return { openWithSystemPlayer: () => true }
		if (name.endsWith('tvbox/client.js')) return { resolveTVBoxVideo: async (video) => ({ url: video.url, headers: {} }), loadHls() {} }
		if (name.endsWith('swipe-back.mjs')) return { createSwipeBack }
		if (name.endsWith('android-playback.js')) return { getAndroidPlayStrategy: () => 1 }
		if (name.endsWith('fullscreen-layout.mjs')) return fullscreenLayout
		if (name.endsWith('app-playback-adjustments.js')) return { createAppPlaybackAdjustments: () => ({
			read: () => ({ volume: native.volume, brightness: native.brightness }),
			setVolume: (value) => (native.volume = Math.max(0, Math.min(1, value))),
			setBrightness: (value) => (native.brightness = Math.max(0.05, Math.min(1, value))),
			restoreBrightness: () => native.brightnessRestores++, resume: () => native.brightnessResumes++
		}) }
		if (name.endsWith('app-fullscreen-controls.js')) return {
			createAppFullscreenControls: (handlers) => {
				native.handlers = handlers
				return { update: (value) => { native.controlState = value; handlers.onVisibilityChange?.(!!value.visible) }, close() {} }
			}
		}
		if (name.endsWith('LibVLCPlayer.vue')) return mockVlc
		if (name.endsWith('.vue')) return mockComponent
		throw new Error(`Unexpected import: ${name}`)
	}
	const module = { exports: {} }
	new Function('require', 'module', 'exports', 'uni', 'plus', componentCode)(requireModule, module, module.exports, uni, plus)
	const node = (tag, text = '') => ({ tag, text, props: {}, style: {}, children: [], parent: null })
	const renderer = vue.createRenderer({
		createElement(tag) { if (tag === 'video') native.videoCreated++; return node(tag) },
		createText: (text) => node('#text', text), createComment: (text) => node('#comment', text),
		setText: (el, value) => { el.text = value }, setComment: (el, value) => { el.text = value },
		setElementText: (el, value) => { el.text = value; el.children = [] },
		patchProp: (el, key, _, value) => { if (el.tag === 'video' && key === 'style') native.videoStyleUpdates++; el.props[key] = value },
		insert(el, parent, anchor) {
			if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
			el.parent = parent
			const index = anchor ? parent.children.indexOf(anchor) : -1
			if (index < 0) parent.children.push(el)
			else parent.children.splice(index, 0, el)
		},
		remove(el) { if (el.tag === 'video') native.videoRemoved++; if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
		parentNode: (el) => el.parent, nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1] || null
	})
	const root = node('root')
	const app = renderer.createApp(module.exports.default)
	app.component('scroll-view', { setup: (_, { attrs, slots }) => () => vue.h('scroll-view', attrs, slots.default?.()) })
	app.component('slider', { setup: (_, { attrs }) => () => vue.h('slider', attrs) })
	app.config.errorHandler = (error) => native.errors.push(error)
	app.mount(root)
	await vue.nextTick()
	assert.deepEqual(native.errors, [])
	t.after(() => app.unmount())
	const all = () => {
		const result = []
		const visit = (el) => { result.push(el); el.children.forEach(visit) }
		visit(root)
		return result
	}
	const textOf = (el) => el.text + el.children.map(textOf).join('')
	const visible = (el) => el.style.display !== 'none' && (!el.parent || visible(el.parent))
	const action = (label) => {
		if (label === '横屏全屏' || label === '竖屏全屏') return all().find((el) => visible(el) && String(el.props.class || '').includes('app-control-btn') && textOf(el) === label)?.props.onClick
		if (!native.controlState?.visible) return undefined
		if (label === '退出全屏' && !native.controlState.locked) return native.handlers.onExit
		if (label === '满屏观影' && !native.controlState.locked) return () => { native.handlers.onMore(); native.menu.success({ tapIndex: 0 }) }
		if (label === (native.controlState.locked ? '解锁' : '锁定')) return native.handlers.onLock
	}
	const click = async (label) => {
		const handler = action(label)
		assert(handler, `Missing native action: ${label}`)
		handler({})
		await vue.nextTick()
		await new Promise((resolve) => setTimeout(resolve, 360))
		await vue.nextTick()
		assert.deepEqual(native.errors, [])
	}
	const swipeBack = async () => {
		const page = all().find(el => String(el.props.class || '').split(' ').includes('app-player-page'))
		page.props.onTouchstart({ touches: [{ clientX: 280, clientY: 500 }], target: {} })
		page.props.onTouchend({ touches: [], changedTouches: [{ clientX: 100, clientY: 510 }] })
		await vue.nextTick()
	}
	return { native, state, hooks, click, action, swipeBack, video: () => all().find((el) => el.tag === 'video'), sliders: () => all().filter((el) => el.tag === 'slider' && el.props.class === 'app-adjustment-slider'), renderedQueue: () => all().filter((el) => String(el.props.class || '').split(' ').includes('app-queue-item')).length }
}

test('two fullscreen buttons select explicit directions and metadata never overrides the selection', async t => {
 const player=await mountPlayer(t,1,0,{video:{width:1080,height:1920}}),original=player.video()
 assert(player.action('横屏全屏'));assert(player.action('竖屏全屏'))
 await player.click('横屏全屏');assert.equal(player.native.orientations.at(-1),'landscape-primary')
 original.props.onLoadedmetadata({detail:{width:720,height:1280}});await vue.nextTick()
 assert.equal(player.native.orientations.at(-1),'landscape-primary')
 await player.click('退出全屏');await player.click('竖屏全屏')
 assert.equal(player.native.orientations.at(-1),'portrait-primary')
 assert.deepEqual(player.video().props.style,{width:'400px',height:'800px'})
 assert.equal(player.native.controlState.width,400);assert.equal(player.native.controlState.height,800)
 original.props.onLoadedmetadata({detail:{width:1920,height:1080}});await vue.nextTick()
 assert.equal(player.native.orientations.at(-1),'portrait-primary')
 await player.click('退出全屏');assert.equal(player.native.orientations.at(-1),'portrait-primary')
 assert.equal(player.video(),original);assert.equal(player.native.videoRemoved,0);assert.equal(player.native.pauses,0)
})

test('manual portrait fullscreen is retained when another episode starts', async t => {
 const player=await mountPlayer(t,2),original=player.video();player.state.settings.autoNext=true
 await player.click('竖屏全屏')
 original.props.onEnded({});await new Promise(resolve=>setTimeout(resolve,520));await vue.nextTick();await new Promise(resolve=>setTimeout(resolve,360));await vue.nextTick()
 assert.equal(player.state.currentId,'test-video-1');assert.equal(player.native.orientations.at(-1),'portrait-primary')
 assert.equal(player.video(),original);assert.equal(player.native.pauses,0);assert.deepEqual(player.native.errors,[])
})

test('portrait fullscreen retains screen lock and restores the normal page after exit', async t => {
 const player=await mountPlayer(t)
 await player.click('竖屏全屏');await player.click('锁定')
 assert.equal(player.hooks.back(),true);assert.equal(player.native.fullscreen,true)
 assert.equal(player.native.controlState.width,400);assert.equal(player.native.controlState.height,800)
 await player.click('解锁');await player.click('退出全屏')
 assert.equal(player.native.fullscreen,false);assert.equal(player.native.orientations.at(-1),'portrait-primary')
 assert.deepEqual(player.video().props.style,{width:'100%',height:'100%'})
})

test('page left swipe returns in portrait but never navigates during fullscreen playback or screen lock', async t => {
	const player = await mountPlayer(t)
	await player.swipeBack(); assert.equal(player.native.backCalls, 1)
	await player.click('横屏全屏'); await player.swipeBack(); assert.equal(player.native.backCalls, 1)
	await player.click('锁定'); await player.swipeBack(); assert.equal(player.native.backCalls, 1)
	assert.equal(player.hooks.back(), true)
	assert.equal(player.native.backCalls, 1)
})

test('entering, filling and exiting fullscreen retains the same video instance without pausing', async (t) => {
	const player = await mountPlayer(t)
	const original = player.video()
	original.props.onPlay({})
	original.props.onTimeupdate({ detail: { currentTime: 25, duration: 120 } })
	await player.click('横屏全屏')
	assert.equal(player.video(), original)
	assert.equal(player.native.fullscreen, true)
	assert.deepEqual(player.video().props.style, { width: '800px', height: '400px' })
	player.native.handlers.onVisibilityChange(false)
	await vue.nextTick()
	assert.equal(player.video().props.controls, false)
	player.native.handlers.onVisibilityChange(true)
	await vue.nextTick()
	assert.equal(player.video().props.controls, true)
	await player.click('满屏观影')
	assert.equal(player.video().props.fill, true)
	assert.equal(player.state.settings.fullscreenFill, true)
	await player.click('退出全屏')
	assert.equal(player.video(), original)
	assert.equal(player.video().props.fill, false)
	assert.equal(player.native.videoCreated, 1)
	assert.equal(player.video().props.fullscreen, false)
	assert.equal(player.native.videoRemoved, 0)
	assert.equal(player.native.pauses, 0)
	assert.equal(player.native.fullscreen, false)
	assert.equal(player.native.orientations.at(-1), 'portrait-primary')
})

test('large playback queues only render the visible window of entries', async (t) => {
	const player = await mountPlayer(t, 236)
	assert.equal(player.state.queue.length, 236)
	assert.equal(player.renderedQueue(), 8)
})

test('screen lock disables playback gestures and blocks back until unlocked', async (t) => {
	const player = await mountPlayer(t)
	await player.click('横屏全屏')
	await player.click('锁定')
	assert.equal(player.video().props.locked, true)
	assert.equal(player.video().props.controls, true)
	player.native.handlers.onVisibilityChange(false)
	await vue.nextTick()
	assert.equal(player.video().props.controls, false)
	player.native.handlers.onVisibilityChange(true)
	await vue.nextTick()
	assert.equal(player.video().props.controls, true)
	assert.equal(player.action('退出全屏'), undefined)
	assert.equal(player.hooks.back(), true)
	assert.equal(player.native.fullscreen, true)
	await player.click('解锁')
	assert.equal(player.video().props.controls, true)
	assert.equal(player.hooks.back(), true)
	await vue.nextTick()
	assert.equal(player.native.fullscreen, false)
	assert.equal(player.native.pauses, 0)
})

test('progress ticks do not relayout the native video and fullscreen saves the latest native position', async (t) => {
	let now = 20000
	t.mock.method(Date, 'now', () => now)
	const player = await mountPlayer(t, 236)
	player.state.settings.rememberProgress = true
	const video = player.video()
	const initialLayouts = player.native.videoStyleUpdates
	video.props.onTimeupdate({ detail: { currentTime: 5, duration: 120 } })
	await vue.nextTick()
	assert.equal(player.native.videoStyleUpdates, initialLayouts)
	await player.click('横屏全屏')
	const fullscreenLayouts = player.native.videoStyleUpdates
	now += 11000
	video.props.onTimeupdate({ detail: { currentTime: 16.25, duration: 120 } })
	await vue.nextTick()
	assert.equal(player.native.videoStyleUpdates, fullscreenLayouts)
	assert.equal(player.native.progress.at(-1)[1], 16.25)
	now += 200
	video.props.onTimeupdate({ detail: { currentTime: 16.45, duration: 120 } })
	video.props.onPause({})
	assert.equal(player.native.progress.at(-1)[1], 16.45)
	await player.click('退出全屏')
	assert.equal(player.video(), video)
	assert.equal(player.native.videoCreated, 1)
})

test('portrait sliders and fullscreen adjustments change native values without relayout, and lock blocks changes', async (t) => {
	const player = await mountPlayer(t)
	const layouts = player.native.videoStyleUpdates
	const [volumeSlider, brightnessSlider] = player.sliders()
	volumeSlider.props.onChange({ detail: { value: 0 } })
	brightnessSlider.props.onChange({ detail: { value: 75 } })
	await vue.nextTick()
	assert.equal(player.native.volume, 0)
	assert.equal(player.native.brightness, 0.75)
	assert.equal(player.native.videoStyleUpdates, layouts)
	await player.click('横屏全屏')
	player.native.handlers.onVolumeChange(0.1)
	player.native.handlers.onBrightnessChange(0.65)
	assert.equal(player.native.volume, 0.1)
	assert.equal(player.native.brightness, 0.65)
	await player.click('锁定')
	player.native.handlers.onVolumeChange(0.1)
	player.native.handlers.onBrightnessChange(0.1)
	assert.equal(player.native.volume, 0.1)
	assert.equal(player.native.brightness, 0.65)
	player.hooks.hide()
	assert.equal(player.native.brightnessRestores, 1)
	player.hooks.show()
	assert.equal(player.native.brightnessResumes, 1)
	assert.equal(player.native.pauses, 1, 'backgrounding pauses the native player')
})

test('fullscreen swipe callbacks seek using fresh native progress, retain playback and reject locked or exited gestures', async (t) => {
	const player = await mountPlayer(t)
	const video = player.video()
	assert.equal(video.props.locked, false)
	await player.click('横屏全屏')
	assert.equal(video.props.fullscreen, true, 'fullscreen playback delegates gestures to its overlay')
	video.props.onTimeupdate({ detail: { currentTime: 45, duration: 180 } })
	assert.deepEqual(player.native.handlers.readPlayback(), { position: 45, duration: 180 })
	player.native.handlers.onSeek(155.73)
	assert.deepEqual(player.native.seeks, [155.73])
	assert.equal(player.native.handlers.readPlayback().position, 155.73)
	player.native.handlers.onSeek(999)
	assert.equal(player.native.seeks.at(-1), 179.5)
	player.native.handlers.onSeek(-10)
	assert.equal(player.native.seeks.at(-1), 0)
	await player.click('锁定')
	const before = player.native.seeks.length
	player.native.handlers.onSeek(20)
	assert.equal(player.native.seeks.length, before)
	await player.click('解锁')
	await player.click('退出全屏')
	player.native.handlers.onSeek(20)
	assert.equal(player.native.seeks.length, before)
	assert.equal(player.native.pauses, 0)
	assert.equal(player.video(), video)
	assert.equal(video.props.locked, false)
})

test('LibVLC retains fractional saved progress when resuming playback', async (t) => {
	const player = await mountPlayer(t, 1, 42.75)
	player.video().props.onLoadedmetadata({})
	assert.equal(player.native.seeks.at(-1), 42.75)
})
