// 原生 View 显示在视频层之上，避免横竖屏切换时 WebView 浮层被视频遮挡。
export function createAppFullscreenControls({ onExit, onMore, onLock, onVolumeChange, onBrightnessChange, readAdjustments, onSeek, readPlayback, onVisibilityChange }) {
	const views = new Map()
	const prefix = 'local-video-fullscreen-controls'
	if (typeof plus.nativeObj.View.getViewById === 'function') {
		for (const key of ['touch', 'exit', 'more', 'lock', 'unlock', 'feedback', 'volume-minus', 'volume-label', 'volume-plus', 'brightness-minus', 'brightness-label', 'brightness-plus']) plus.nativeObj.View.getViewById(`${prefix}-${key}`)?.close()
	}
	let current = { visible: false }
	let idleTimer = null
	let controlsVisible = false
	let gesture = null
	let unlockGesture = null
	let unlockOffset = 0
	let unlockCompleted = false
	let suppressClickUntil = 0
	const hasGestures = !!(onVolumeChange || onBrightnessChange || onSeek)
	const fullTouchRect = { top: '0px', left: '0px', width: '100%', height: '100%' }
	const hide = () => views.forEach((view) => view.hide())
	const unlockRect = () => ({ left: (current.width - 210) / 2, top: Math.max(70, current.height - 116), width: 210, height: 48 })
	const ensureTouchLayer = () => {
		let view = views.get('touch')
		const styles = { top: '0px', left: '0px', width: `${current.width}px`, height: `${current.height}px`, position: 'absolute', backgroundColor: 'rgba(0,0,0,0)' }
		if (!view) {
			view = new plus.nativeObj.View(`${prefix}-touch`, styles, [{ tag: 'rect', position: { top: '0px', left: '0px', width: '100%', height: '100%' }, rectStyles: { color: 'rgba(0,0,0,0.001)' } }])
			view.interceptTouchEvent(true)
			view.setTouchEventRect(fullTouchRect)
			view.addEventListener('click', () => {
				if (Date.now() < suppressClickUntil) return
				if (controlsVisible) { clearTimeout(idleTimer); hideIdle() }
				else reveal()
			})
			if (hasGestures) {
				view.addEventListener('touchstart', beginGesture)
				view.addEventListener('touchmove', moveGesture)
				view.addEventListener('touchend', endGesture)
				view.addEventListener('touchcancel', cancelGesture)
			}
			views.set('touch', view)
		} else view.setStyle(styles)
		return view
	}
	const drawButton = (key, text, left, top, width, handler) => {
		const styles = { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: '38px', position: 'absolute', backgroundColor: 'rgba(0,0,0,0)' }
		const tags = [
			{ tag: 'rect', id: 'background', position: { top: '0px', left: '0px', width: '100%', height: '100%' }, rectStyles: { color: 'rgba(0,0,0,0.58)', radius: '19px' } },
			{ tag: 'font', id: 'label', text, position: { top: '0px', left: '0px', width: '100%', height: '100%' }, textStyles: { align: 'center', verticalAlign: 'middle', size: key === 'more' ? '23px' : key === 'feedback' ? '17px' : '13px', color: '#FFFFFF' } }
		]
		let view = views.get(key)
		if (!view) {
			view = new plus.nativeObj.View(`${prefix}-${key}`, styles, tags)
			view.addEventListener('click', () => { reveal(); handler() })
			views.set(key, view)
		} else {
			view.setStyle(styles)
			view.reset()
			view.draw(tags)
		}
		view.show()
	}
	function refreshValues() {
		if (!current.locked && readAdjustments) {
			try { Object.assign(current, readAdjustments()) } catch (error) { /* retain last displayed values */ }
		}
	}
	function drawUnlock() {
		const rect = unlockRect()
		const styles = { left: `${rect.left}px`, top: `${rect.top}px`, width: '210px', height: '48px', position: 'absolute', backgroundColor: 'rgba(0,0,0,0)' }
		const shape = (id, left, top, width, height, color, radius) => ({ tag: 'rect', id, position: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }, rectStyles: { color, radius: `${radius}px` } })
		const tags = [
			shape('track', 0, 0, 210, 48, 'rgba(0,0,0,0.64)', 24),
			{ tag: 'font', id: 'label', text: '向右滑动解锁', position: { left: '49px', top: '0px', width: '154px', height: '48px' }, textStyles: { align: 'center', verticalAlign: 'middle', size: '14px', color: '#FFFFFF' } },
			shape('thumb', unlockOffset, 0, 48, 48, '#FFFFFF', 24),
			shape('shackle', unlockOffset + 16, 10, 16, 20, '#172222', 8),
			shape('shackle-hole', unlockOffset + 19, 13, 10, 17, '#FFFFFF', 5),
			shape('lock-body', unlockOffset + 12, 22, 24, 18, '#172222', 3),
			shape('key-hole', unlockOffset + 23, 28, 3, 7, '#FFFFFF', 1.5)
		]
		let view = views.get('unlock')
		if (!view) {
			view = new plus.nativeObj.View(`${prefix}-unlock`, styles, tags)
			view.interceptTouchEvent(true)
			view.setTouchEventRect(fullTouchRect)
			view.addEventListener('touchstart', (event) => {
				if (!current.visible || !current.locked || unlockCompleted) return
				clearTimeout(idleTimer)
				const x = Number(event?.clientX), y = Number(event?.clientY)
				unlockGesture = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 52 && y >= 0 && y <= 48 ? { x, y, lastDraw: 0, cancelled: false } : null
			})
			view.addEventListener('touchmove', moveUnlock)
			view.addEventListener('touchend', (event) => {
				if (!current.visible || !current.locked || unlockCompleted) return
				moveUnlock(event, true)
				if (unlockCompleted || !current.visible || !current.locked) return
				unlockGesture = null
				unlockOffset = 0
				drawUnlock()
				idleTimer = setTimeout(hideIdle, 3000)
			})
			views.set('unlock', view)
		} else {
			view.setStyle(styles)
			view.reset()
			view.draw(tags)
		}
		view.show()
	}
	function moveUnlock(event, finished = false) {
		if (!unlockGesture || !current.visible || !current.locked || unlockCompleted) return
		const x = Number(event?.clientX), y = Number(event?.clientY)
		if (!Number.isFinite(x) || !Number.isFinite(y)) return
		if (Math.abs(y - unlockGesture.y) > 48) unlockGesture.cancelled = true
		unlockOffset = unlockGesture.cancelled ? 0 : Math.min(162, Math.max(0, x - unlockGesture.x))
		// 到位即解锁；手指划出原生 View 时可能收不到 touchend。
		if (!unlockGesture.cancelled && unlockOffset >= 162 * 0.9) {
			unlockCompleted = true
			unlockGesture = null
			controlsVisible = false
			clearTimeout(idleTimer)
			hide()
			onVisibilityChange?.(false)
			onLock()
			return
		}
		const now = Date.now()
		if (!finished && unlockGesture.lastDraw && now - unlockGesture.lastDraw < 32) return
		unlockGesture.lastDraw = now
		drawUnlock()
	}
	function touchRect() {
		// 底部留给原生播放、进度条；锁定时才覆盖整个屏幕。
		return hasGestures && !current.locked && controlsVisible ? { top: '0px', left: '0px', width: '100%', height: `${Math.max(0, current.height - 60)}px` } : fullTouchRect
	}
	function hideIdle() {
		controlsVisible = false
		unlockGesture = null
		unlockOffset = 0
		hide()
		onVisibilityChange?.(false)
		if (!current.visible) return
		const touch = ensureTouchLayer()
		touch.setTouchEventRect(touchRect())
		touch.show()
	}
	function beginGesture(event) {
		gesture = null
		if (!current.visible || current.locked) return
		const x = Number(event?.clientX)
		const y = Number(event?.clientY)
		if (!Number.isFinite(x) || !Number.isFinite(y)) return
		refreshValues()
		const verticalKind = x < current.width / 2 ? 'volume' : 'brightness'
		let playback = {}
		try { playback = readPlayback?.() || {} } catch (error) { /* wait for valid metadata before seeking */ }
		const total = Number(playback.duration)
		const position = Number(playback.position)
		gesture = {
			x, y, verticalKind, kind: null, start: Number(current[verticalKind]) || 0,
			position: Number.isFinite(position) ? Math.max(0, position) : 0,
			duration: Number.isFinite(total) && total > 0 ? total : 0,
			active: false, moved: false, cancelled: false, lastApply: 0, lastX: x, lastY: y
		}
		clearTimeout(idleTimer)
	}
	function moveGesture(event, finished = false) {
		if (!gesture || !current.visible || current.locked || gesture.cancelled) return
		const x = Number(event?.clientX)
		const y = Number(event?.clientY)
		if (!Number.isFinite(x) || !Number.isFinite(y)) return
		const dx = x - gesture.x
		const dy = gesture.y - y
		gesture.lastX = x
		gesture.lastY = y
		if (!gesture.active) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
			gesture.moved = true
			// 判定方向后保持不变，斜向抖动不会同时触发音量和进度。
			if (Math.abs(dx) > Math.abs(dy) * 1.2) {
				if (!onSeek || !gesture.duration) { gesture.cancelled = true; return }
				gesture.kind = 'seek'
			} else if (Math.abs(dy) > Math.abs(dx) * 1.2) {
				gesture.kind = gesture.verticalKind
				if (!(gesture.kind === 'volume' ? onVolumeChange : onBrightnessChange)) { gesture.cancelled = true; return }
			} else return
			gesture.active = true
			views.forEach((view, key) => { if (key !== 'touch') view.hide() })
			controlsVisible = false
			onVisibilityChange?.(false)
			views.get('touch').setTouchEventRect(touchRect())
		}
		const now = Date.now()
		if (!finished && gesture.lastApply && now - gesture.lastApply < 80) return
		gesture.lastApply = now
		if (gesture.kind === 'seek') {
			// 一屏最多调整两分钟；拖动时只预览，松手才 seek 一次。
			const requested = gesture.position + dx / Math.max(1, current.width) * Math.min(120, gesture.duration)
			gesture.target = Math.floor(Math.min(Math.max(0, gesture.duration - 0.5), Math.max(0, requested)))
			const delta = gesture.target - gesture.position
			const time = (seconds) => {
				const whole = Math.floor(Math.max(0, seconds))
				const pad = (value) => String(value).padStart(2, '0')
				return whole >= 3600 ? `${Math.floor(whole / 3600)}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}` : `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`
			}
			const width = Math.min(320, current.width - 32)
			drawButton('feedback', `${delta >= 0 ? '快进 +' : '后退 -'}${Math.round(Math.abs(delta))}秒  ${time(gesture.target)} / ${time(gesture.duration)}`, (current.width - width) / 2, Math.max(64, current.height * 0.25), width, () => {})
			views.get('feedback').interceptTouchEvent(false)
			return
		}
		const minimum = gesture.kind === 'brightness' ? 0.05 : 0
		const requested = Math.min(1, Math.max(minimum, gesture.start + dy / Math.max(160, current.height * 0.65)))
		const value = (gesture.kind === 'volume' ? onVolumeChange : onBrightnessChange)(requested)
		if (!Number.isFinite(value)) return
		current[gesture.kind] = value
		drawButton('feedback', `${gesture.kind === 'volume' ? '音量' : '亮度'} ${Math.round(value * 100)}%`, (current.width - 160) / 2, Math.max(64, current.height * 0.25), 160, () => {})
		views.get('feedback').interceptTouchEvent(false)
	}
	function endGesture(event) {
		if (!gesture) return
		moveGesture(Number.isFinite(Number(event?.clientX)) && Number.isFinite(Number(event?.clientY)) ? event : { clientX: gesture.lastX, clientY: gesture.lastY }, true)
		const completed = gesture
		const active = completed.active
		gesture = null
		if (active) {
			if (completed.kind === 'seek' && current.visible && !current.locked && Number.isFinite(completed.target)) onSeek(completed.target)
		}
		if (completed.moved) suppressClickUntil = Date.now() + 350
		clearTimeout(idleTimer)
		idleTimer = setTimeout(hideIdle, active ? 900 : 3000)
	}
	function cancelGesture() {
		if (!gesture) return
		suppressClickUntil = Date.now() + 350
		gesture = null
		clearTimeout(idleTimer)
		hideIdle()
	}
	function excludeButtons(holes) {
		let rectangles = [{ left: 0, top: 0, width: current.width, height: current.locked ? current.height : current.height - 60 }]
		for (const hole of holes) {
			rectangles = rectangles.flatMap((rect) => {
				const left = Math.max(rect.left, hole.left), top = Math.max(rect.top, hole.top)
				const right = Math.min(rect.left + rect.width, hole.left + hole.width), bottom = Math.min(rect.top + rect.height, hole.top + hole.height)
				if (right <= left || bottom <= top) return [rect]
				return [
					{ left: rect.left, top: rect.top, width: rect.width, height: top - rect.top },
					{ left: rect.left, top: bottom, width: rect.width, height: rect.top + rect.height - bottom },
					{ left: rect.left, top, width: left - rect.left, height: bottom - top },
					{ left: right, top, width: rect.left + rect.width - right, height: bottom - top }
				].filter((part) => part.width > 0 && part.height > 0)
			})
		}
		return rectangles.map((rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, `${value}px`])))
	}
	function reveal() {
		clearTimeout(idleTimer)
		unlockGesture = null
		unlockOffset = 0
		unlockCompleted = false
		hide()
		if (!current.visible) { controlsVisible = false; onVisibilityChange?.(false); return }
		controlsVisible = true
		refreshValues()
		const touch = ensureTouchLayer()
		const lockTop = Math.max(60, (current.height - 38) / 2)
		const exitLeft = Math.max(24, current.width - 120)
		const exitTop = Math.max(68, current.height - 102)
		if (current.locked || hasGestures) {
			// 触摸遮罩可能位于按钮之上，给解锁按钮留出可点击区域。
			const holes = [current.locked ? unlockRect() : { left: 24, top: lockTop, width: 72, height: 38 }]
			if (!current.locked) holes.push({ left: exitLeft, top: exitTop, width: 96, height: 38 }, { left: current.width - 76, top: 18, width: 52, height: 38 })
			touch.setTouchEventRect(excludeButtons(holes))
			touch.show()
		}
		if (!current.locked) {
			drawButton('exit', '退出全屏', exitLeft, exitTop, 96, onExit)
			drawButton('more', '···', Math.max(24, current.width - 76), 18, 52, onMore)
		}
		if (current.locked) drawUnlock()
		else drawButton('lock', '锁定', 24, lockTop, 72, onLock)
		onVisibilityChange?.(true)
		idleTimer = setTimeout(hideIdle, 3000)
	}
	return {
		update(next) {
			gesture = null
			unlockGesture = null
			current = next
			reveal()
		},
		close() {
			controlsVisible = false
			gesture = null
			unlockGesture = null
			clearTimeout(idleTimer)
			current = { visible: false }
			views.forEach((view) => view.close())
			views.clear()
			onVisibilityChange?.(false)
		}
	}
}
