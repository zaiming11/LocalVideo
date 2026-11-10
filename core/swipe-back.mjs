const interactive = 'input,textarea,select,video,slider,uni-input,uni-textarea,uni-slider,uni-video,[role="slider"],[data-no-swipe-back]'

export function createSwipeBack({ canGoBack = () => true, onBack, now = () => Date.now() }) {
  let start = null
  const cancel = () => { start = null }
  const point = event => event?.changedTouches?.[0] || event?.touches?.[0]
  const coordinates = touch => ({ x: Number(touch?.clientX ?? touch?.pageX), y: Number(touch?.clientY ?? touch?.pageY) })
  return {
    start(event) {
      cancel()
      if (!canGoBack() || event?.touches?.length !== 1) return
      const target = event.target
      if (target?.closest?.(interactive) || target?.dataset?.noSwipeBack || /^(app-player|h5-video)$/.test(target?.id || '')) return
      const position = coordinates(event.touches[0])
      if (Number.isFinite(position.x) && Number.isFinite(position.y)) start = { ...position, time: now() }
    },
    move(event) {
      if (!start) return
      if (!canGoBack() || event?.touches?.length !== 1) return cancel()
      const p = coordinates(event.touches[0]), dx = p.x - start.x, dy = p.y - start.y
      // A vertical scroll or rightward gesture must never become a back gesture later.
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) || dx > 20) cancel()
    },
    end(event) {
      const origin = start
      cancel()
      if (!origin || !canGoBack() || event?.touches?.length > 0) return false
      const p = coordinates(point(event)), dx = p.x - origin.x, dy = p.y - origin.y
      if (dx > -80 || Math.abs(dx) < Math.abs(dy) * 2 || now() - origin.time > 1000 || !Number.isFinite(dx + dy)) return false
      if (event.cancelable) event.preventDefault?.()
      onBack()
      return true
    },
    cancel
  }
}
