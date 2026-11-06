import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAppFullscreenControls } from '../core/app-fullscreen-controls.js'

test('native controls fit within the screen and expose only the unlock slider while locked', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	const views = []
	globalThis.plus = { nativeObj: { View: class {
		constructor(id, styles, tags = []) { this.id = id; this.styles = styles; this.tags = tags; this.visible = false; views.push(this) }
		addEventListener(_, handler) { this.click = handler }
		interceptTouchEvent() {}
		setTouchEventRect(rect) { this.touchRect = rect }
		setStyle(styles) { this.styles = styles }
		reset() { this.tags = [] }
		draw(tags) { this.tags = tags }
		show() { this.visible = true }
		hide() { this.visible = false }
		close() { this.closed = true; this.visible = false }
	} } }
	const clicks = []
	const controls = createAppFullscreenControls({ onExit: () => clicks.push('exit'), onMore: () => clicks.push('more'), onLock: () => clicks.push('lock') })
	controls.update({ visible: true, locked: false, width: 794, height: 360 })
	assert.equal(views.length, 4)
	for (const view of views.filter((view) => view.tags.some((tag) => tag.id === 'label'))) {
		assert.equal(view.visible, true)
		assert(Number.parseFloat(view.styles.left) + Number.parseFloat(view.styles.width) <= 794)
		assert(Number.parseFloat(view.styles.top) + Number.parseFloat(view.styles.height) <= 360)
		view.click({})
	}
	assert.deepEqual(clicks, ['exit', 'more', 'lock'])
	t.mock.timers.tick(3001)
	assert.equal(views.filter((view) => view.visible).length, 1)
	const touch = views.find((view) => view.id.endsWith('-touch'))
	assert.equal(touch.visible, true)
	touch.click()
	assert.equal(views.filter((view) => view.visible).length, 3)
	touch.click()
	assert.equal(views.filter((view) => view.visible).length, 1, 'a tap hides visible fullscreen controls')
	touch.click()
	assert.equal(views.filter((view) => view.visible).length, 3, 'a tap reveals hidden fullscreen controls')
	controls.update({ visible: true, locked: true, width: 794, height: 360 })
	const visible = views.filter((view) => view.visible && view !== touch)
	assert.equal(visible.length, 1)
	assert.equal(visible[0].tags.find((tag) => tag.id === 'label').text, '向右滑动解锁')
	const unlock = visible[0]
	const unlockX = Number.parseFloat(unlock.styles.left) + Number.parseFloat(unlock.styles.width) / 2
	const unlockY = Number.parseFloat(unlock.styles.top) + Number.parseFloat(unlock.styles.height) / 2
	assert(Array.isArray(touch.touchRect))
	assert(touch.touchRect.every((rect) => {
		const left = Number.parseFloat(rect.left)
		const top = Number.parseFloat(rect.top)
		const width = rect.width === '100%' ? 794 : Number.parseFloat(rect.width)
		const height = rect.height === '100%' ? 360 : Number.parseFloat(rect.height)
		return unlockX < left || unlockX >= left + width || unlockY < top || unlockY >= top + height
	}))
	t.mock.timers.tick(3001)
	assert.equal(views.filter((view) => view.visible).length, 1)
	assert.deepEqual(touch.touchRect, { top: '0px', left: '0px', width: '100%', height: '100%' })
	touch.click()
	assert.equal(views.filter((view) => view.visible && view !== touch).length, 1)
	touch.click()
	assert.equal(views.filter((view) => view.visible && view !== touch).length, 0, 'locked controls also toggle together')
	controls.update({ visible: false })
	assert(views.every((view) => !view.visible))
	controls.close()
	assert(views.every((view) => view.closed))
})

test('unlock requires dragging the thumb to the right end; taps, partial drags and vertical swipes stay locked', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	const views = []
	globalThis.plus = { nativeObj: { View: class {
		constructor(id, styles, tags) { Object.assign(this, { id, styles, tags, visible: false, events: {} }); views.push(this) }
		addEventListener(name, handler) { this.events[name] = handler }
		interceptTouchEvent() {}
		setTouchEventRect() {}
		setStyle(styles) { this.styles = styles }
		reset() { this.tags = [] }
		draw(tags) { this.tags = tags }
		show() { this.visible = true }
		hide() { this.visible = false }
		close() { this.visible = false }
	} } }
	let unlocked = 0
	const visibility = []
	const controls = createAppFullscreenControls({ onExit() {}, onMore() {}, onLock: () => unlocked++, onVisibilityChange: (value) => visibility.push(value) })
	controls.update({ visible: true, locked: true, width: 794, height: 360 })
	const slider = views.find((view) => view.id.endsWith('-unlock'))
	assert.equal(slider.styles.left, '292px')
	assert.equal(slider.styles.top, '244px')
	const point = (x, y = 24) => ({ clientX: x, clientY: y })
	const drag = (from, to) => { slider.events.touchstart(from); slider.events.touchmove(to); slider.events.touchend(to) }
	drag(point(24), point(24))
	drag(point(100), point(205))
	drag(point(24), point(100))
	assert.equal(unlocked, 0)
	assert.equal(slider.tags.find((tag) => tag.id === 'thumb').position.left, '0px')
	drag(point(24), point(200, 100))
	assert.equal(unlocked, 0)
	slider.events.touchstart(point(24))
	t.mock.timers.tick(4000)
	assert.equal(slider.visible, true, 'idle timer must not hide an active unlock gesture')
	slider.events.touchmove(point(200))
	assert.equal(unlocked, 1, 'reaching the end unlocks even if the finger leaves the view before touchend')
	slider.events.touchend(point(200))
	assert.equal(unlocked, 1)
	assert.equal(slider.visible, false)
	assert.equal(visibility.at(-1), false)
	controls.close()
})

test('left vertical swipes control volume, right swipes control brightness, exit is bottom-right and lock blocks gestures', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	const views = []
	globalThis.plus = { nativeObj: { View: class {
		constructor(id, styles, tags) { Object.assign(this, { id, styles, tags, visible: false }); views.push(this) }
		addEventListener(name, handler) { (this.events ||= {})[name] = handler; if (name === 'click') this.click = handler }
		interceptTouchEvent() {}
		setTouchEventRect(rect) { this.touchRect = rect }
		setStyle(styles) { this.styles = styles }
		reset() { this.tags = [] }
		draw(tags) { this.tags = tags }
		show() { this.visible = true }
		hide() { this.visible = false }
		close() { this.visible = false }
	} } }
	const values = { volume: 0.4, brightness: 0.6 }
	let changes = 0
	const controls = createAppFullscreenControls({
		onExit() {}, onMore() {}, onLock() {}, readAdjustments: () => values,
		onVolumeChange: (value) => { changes++; return values.volume = value },
		onBrightnessChange: (value) => { changes++; return values.brightness = value }
	})
	const find = (key) => views.find((view) => view.id.endsWith(`-${key}`))
	const label = (key) => find(key).tags.find((tag) => tag.id === 'label').text
	controls.update({ visible: true, locked: false, width: 794, height: 360 })
	assert(Number.parseFloat(find('exit').styles.left) > 794 / 2)
	assert(Number.parseFloat(find('exit').styles.top) > 360 / 2)
	for (const view of views.filter((view) => view.visible)) {
		assert(Number.parseFloat(view.styles.left) + Number.parseFloat(view.styles.width) <= 794)
	}
	t.mock.timers.tick(3001)
	assert.equal(views.filter((view) => view.visible).length, 1)
	const touch = find('touch')
	const swipe = (x, fromY, toY) => {
		touch.events.touchstart({ clientX: x, clientY: fromY })
		touch.events.touchmove({ clientX: x, clientY: toY })
		touch.events.touchend({ clientX: x, clientY: toY })
	}
	swipe(200, 200, 140)
	assert(values.volume > 0.4)
	assert.equal(values.brightness, 0.6)
	assert.match(label('feedback'), /^音量 /)
	const volume = values.volume
	swipe(600, 150, 210)
	assert(values.brightness < 0.6)
	assert.equal(values.volume, volume)
	assert.match(label('feedback'), /^亮度 /)
	t.mock.timers.tick(901)
	assert.equal(find('feedback').visible, false)
	const before = changes
	touch.events.touchstart({ clientX: 200, clientY: 200 })
	touch.events.touchmove({ clientX: 230, clientY: 202 })
	touch.events.touchend({ clientX: 230, clientY: 202 })
	assert.equal(changes, before)
	controls.update({ visible: true, locked: true, width: 794, height: 360 })
	swipe(200, 200, 100)
	swipe(600, 200, 100)
	assert.equal(changes, before)
	controls.update({ visible: false })
	swipe(200, 200, 100)
	assert.equal(changes, before)
	controls.close()
})

test('horizontal swipes preview then seek once, clamp endpoints and never bypass lock or cancellation', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const previousPlus = globalThis.plus
	t.after(() => { globalThis.plus = previousPlus })
	const views = []
	globalThis.plus = { nativeObj: { View: class {
		constructor(id, styles, tags) { Object.assign(this, { id, styles, tags, events: {} }); views.push(this) }
		addEventListener(name, handler) { this.events[name] = handler }
		interceptTouchEvent() {}
		setTouchEventRect() {}
		setStyle(styles) { this.styles = styles }
		reset() { this.tags = [] }
		draw(tags) { this.tags = tags }
		show() { this.visible = true }
		hide() { this.visible = false }
		close() { this.visible = false }
	} } }
	const seeks = [], adjustments = [], visibility = []
	let playback = { position: 60, duration: 180 }
	const controls = createAppFullscreenControls({
		onExit() {}, onMore() {}, onLock() {}, readPlayback: () => playback,
		onSeek: (value) => seeks.push(value), onVisibilityChange: (value) => visibility.push(value),
		onVolumeChange: (value) => { adjustments.push('volume'); return value },
		onBrightnessChange: (value) => { adjustments.push('brightness'); return value }
	})
	const show = (locked = false) => controls.update({ visible: true, locked, width: 800, height: 360, volume: 0.5, brightness: 0.5 })
	show()
	const touch = views.find((view) => view.id.endsWith('-touch'))
	const point = (x, y = 180) => ({ clientX: x, clientY: y })
	const drag = (from, to) => { touch.events.touchstart(from); touch.events.touchmove(to); touch.events.touchend(to) }
	t.mock.timers.tick(3001)
	touch.events.touchstart(point(100))
	touch.events.touchmove(point(500))
	assert.deepEqual(seeks, [], 'drag preview must not repeatedly seek the decoder')
	assert.match(views.find((view) => view.id.endsWith('-feedback')).tags.find((tag) => tag.id === 'label').text, /快进 \+60秒.*02:00 \/ 03:00/)
	playback = { position: 80, duration: 180 }
	t.mock.timers.tick(4000)
	assert.equal(views.find((view) => view.id.endsWith('-feedback')).visible, true)
	touch.events.touchend({})
	assert.deepEqual(seeks, [120], 'missing touchend coordinates use the last point and the initial position')
	touch.events.click()
	assert.equal(visibility.at(-1), false, 'synthetic click after a swipe must not toggle controls')
	assert.deepEqual(adjustments, [])
	playback = { position: 20, duration: 180 }
	drag(point(650), point(50))
	assert.equal(seeks.at(-1), 0)
	playback = { position: 170, duration: 180 }
	drag(point(100), point(750))
	assert.equal(seeks.at(-1), 179)
	const before = seeks.length
	drag(point(100), point(104, 182))
	touch.events.touchstart(point(100))
	touch.events.touchmove(point(500))
	touch.events.touchcancel()
	touch.events.touchend(point(500))
	assert.equal(seeks.length, before)
	show(true)
	drag(point(100), point(500))
	assert.equal(seeks.length, before)
	show()
	playback = { position: 0, duration: 0 }
	drag(point(100), point(500))
	assert.equal(seeks.length, before, 'unknown duration must not generate an invalid seek')
	playback = { position: 60, duration: 180 }
	touch.events.touchstart(point(100))
	touch.events.touchmove(point(500))
	controls.update({ visible: false })
	touch.events.touchend(point(600))
	assert.equal(seeks.length, before)
	show()
	drag(point(600), point(602, 100))
	assert.deepEqual(adjustments, ['brightness', 'brightness'])
	assert.equal(seeks.length, before)
	controls.close()
})
