// HTML media event contract lets history, TVBox resolution and queue logic stay shared.
export function createDesktopVlc({ title, fill, onNext, onPrevious, onFitChange, onRateChange }) {
  const bridge = window.localVideoDesktop
  const listeners = new Map()
  let source = '', openedSource = '', generation = 0, disposed = false, opening, volume = 1, muted = false, rate = 1
  const emit = type => { for (const callback of listeners.get(type) || []) callback({ type, target: adapter }) }
  const safeCommand = (action, input) => bridge.vlcCommand(action, input).catch(error => { if (!disposed) { adapter.error = { code:4, message:error.message }; emit('error') } })
  const adapter = {
    isLibVLC: true, currentTimeValue:0, duration:0, paused:true, error:null, poster:'',
    buffered:{length:0,end:() => 0}, canPlayType:() => 'probably',
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(callback) },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback) },
    get src() { return source }, set src(value) { source = value },
    removeAttribute(name) { if (name === 'src') source = '' },
    get currentTime() { return this.currentTimeValue }, set currentTime(value) { this.currentTimeValue = value; safeCommand('seek',{value}); emit('timeupdate') },
    get volume() { return volume }, set volume(value) { volume = value; if (openedSource) safeCommand('volume',{value,muted}); emit('volumechange') },
    get muted() { return muted }, set muted(value) { muted = !!value; if (openedSource) safeCommand('volume',{value:volume,muted}); emit('volumechange') },
    get playbackRate() { return rate }, set playbackRate(value) { rate = value; if (openedSource) safeCommand('rate',{value}) },
    load() { openedSource = ''; this.error = null; this.currentTimeValue = this.duration = 0 },
    async play() {
      if (disposed || !source) return
      if (source !== openedSource) {
        const src = source, ticket = ++generation
        openedSource = src; this.error = null
        opening = bridge.vlcOpen({ src, generation:ticket, title:title(), fill:fill(), volume, muted, rate })
        try { await opening } catch (error) { if (ticket === generation && !disposed) { openedSource = ''; this.error = {code:4,message:error.message}; emit('error') } throw error }
        if (ticket !== generation || disposed) return
        await bridge.vlcCommand('volume',{value:volume,muted}); await bridge.vlcCommand('rate',{value:rate})
      } else { if (opening) await opening; await bridge.vlcCommand('play') }
    },
    pause() { if (openedSource && !disposed) safeCommand('pause') },
    fullscreen(value,direction) { safeCommand('fullscreen',{value,direction}) },
    fit(value) { safeCommand('fit',{fill:value}) },
    focus() { if (!openedSource) return this.play(); return safeCommand('focus') },
    release() { if (disposed) return; disposed = true; unsubscribe(); listeners.clear(); bridge.vlcCommand('close').catch(() => {}) }
  }
  const unsubscribe = bridge.onVlcEvent(state => {
    if (disposed) return
    if (state.type === 'next') { onNext(); return }
    if (state.type === 'previous') { onPrevious(); return }
    if (state.type === 'closed') { adapter.paused = true; openedSource = ''; emit('pause'); return }
    if (state.type === 'error') { adapter.error = {code:4,message:state.error}; emit('error'); return }
    if (state.generation !== generation) return
    adapter.currentTimeValue = state.currentTime; adapter.duration = state.duration; adapter.paused = state.paused
    if (typeof state.volume === 'number' && (volume !== state.volume || muted !== !!state.muted)) { volume = state.volume; muted = !!state.muted; emit('volumechange') }
    if (typeof state.rate === 'number' && rate !== state.rate) { rate = state.rate; onRateChange?.(rate) }
    if (typeof state.fill === 'boolean' && state.fill !== fill()) onFitChange?.(state.fill)
    if (state.error) adapter.error = {code:4,message:state.error}
    for (const type of state.events || []) emit(type)
    emit('timeupdate')
  })
  return adapter
}
