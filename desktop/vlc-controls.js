const $ = id => document.getElementById(id)
let state = { paused:true, currentTime:0, duration:0, volume:1 }, locked = false, visible = true, idleTimer, statusTimer, dragging = false, gesture, unlockGesture, suppressClick = 0, brightness = 1, lastVolumeAt = 0
const clock = value => { const s = Math.floor(Math.max(0,value || 0)); return (s >= 3600 ? Math.floor(s/3600) + ':' : '') + String(Math.floor(s/60)%60).padStart(2,'0') + ':' + String(s%60).padStart(2,'0') }
const command = (action,input) => window.vlc.command(action,input).catch(error => feedback(error.message,5000))
function feedback(text,delay = 1200) { clearTimeout(statusTimer); $('status').textContent = text; statusTimer = setTimeout(() => { $('status').textContent = '' },delay) }
function reveal() { visible = true; document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(hide,3000) }
function hide() { visible = false; document.body.classList.add('idle'); $('menu').hidden = true; clearTimeout(idleTimer) }
function lock(value) { locked = value; document.body.classList.toggle('locked',value); $('unlock').hidden = !value; $('seek').disabled = value; $('unlock-thumb').style.transform = ''; reveal() }
const seek = value => { if (!locked && state.duration > 0) { command('seek',{value:Math.max(0,Math.min(state.duration-.1,value))}); reveal() } }
const toggle = () => { if (!locked) { command(state.paused ? 'play':'pause'); reveal() } }
function volume(value,force = false) { state.volume = Math.max(0,Math.min(1,value)); state.muted = false; $('volume').value = Math.round(state.volume*100); if (force || Date.now()-lastVolumeAt>=80) { lastVolumeAt = Date.now(); command('volume',{value:state.volume,muted:false}) } }
function light(value) { brightness = Math.max(.05,Math.min(1,value)); $('brightness').style.opacity = 1-brightness; $('light').value = Math.round(brightness*100) }
for (const [id,action] of [['previous','previous'],['next','next'],['return','close']]) $(id).onclick = () => { if (!locked) command(action) }
$('play').onclick = toggle; $('back').onclick = () => seek(state.currentTime-10); $('forward').onclick = () => seek(state.currentTime+10)
$('mute').onclick = () => { state.muted = !state.muted; command('volume',{value:state.volume,muted:state.muted}) }
$('volume').oninput = event => volume(Number(event.target.value)/100)
$('volume').onchange = event => volume(Number(event.target.value)/100,true)
$('light').oninput = event => light(Number(event.target.value)/100)
$('rate').onchange = event => command('rate',{value:Number(event.target.value)})
$('more').onclick = () => { $('menu').hidden = !$('menu').hidden; clearTimeout(idleTimer) }
$('fill').onclick = () => command('fit',{fill:!state.fill})
$('lock').onclick = () => lock(true)
for (const [id,direction] of [['landscape','landscape'],['portrait','portrait']]) $(id).onclick = () => command('fullscreen',{value:true,direction})
$('exit').onclick = () => command('fullscreen',{value:false})
$('seek').onpointerdown = () => { dragging = true; clearTimeout(idleTimer) }
$('seek').oninput = event => { if (!locked) $('current').textContent = clock(state.duration*Number(event.target.value)/10000) }
$('seek').onchange = event => { dragging = false; seek(state.duration*Number(event.target.value)/10000) }
$('seek').onpointercancel = () => { dragging = false; reveal() }
$('seek').onpointerup = () => { dragging = false; reveal() }
$('unlock-thumb').onpointerdown = event => { if (!locked) return; unlockGesture = event.clientX; event.target.setPointerCapture(event.pointerId); clearTimeout(idleTimer); event.stopPropagation() }
$('unlock-thumb').onpointermove = event => {
  if (unlockGesture == null) return
  const offset = Math.max(0,Math.min(190,event.clientX-unlockGesture)); event.target.style.transform = `translateX(${offset}px)`
  if (offset >= 171) { unlockGesture = null; suppressClick = Date.now()+350; lock(false) }
}
function resetUnlock() { unlockGesture = null; $('unlock-thumb').style.transform = ''; reveal() }
$('unlock-thumb').onpointerup = resetUnlock; $('unlock-thumb').onpointercancel = resetUnlock
$('stage').addEventListener('click',event => {
  if (Date.now()<suppressClick || event.target.closest('button,input,select,label,#menu,#unlock')) return
  if (visible) hide(); else reveal()
})
$('stage').addEventListener('pointermove',event => { if (event.pointerType === 'mouse' && !gesture) reveal() })
$('stage').addEventListener('pointerdown',event => {
  if (locked || !state.fullscreen || event.target.closest('button,input,select,label,#menu,#unlock')) return
  gesture = { x:event.clientX,y:event.clientY,position:state.currentTime,volume:state.volume,brightness,kind:null,moved:false }
  event.currentTarget.setPointerCapture(event.pointerId); clearTimeout(idleTimer)
})
$('stage').addEventListener('pointermove',event => {
  if (!gesture || locked) return
  const dx = event.clientX-gesture.x,dy = gesture.y-event.clientY
  if (!gesture.kind) { if (Math.max(Math.abs(dx),Math.abs(dy))<10) return; gesture.kind = Math.abs(dx)>Math.abs(dy)*1.2 ? 'seek' : gesture.x<innerWidth/2 ? 'volume':'brightness' }
  gesture.moved = true; suppressClick = Date.now()+350
  if (gesture.kind === 'seek') { gesture.target = Math.max(0,Math.min(state.duration-.1,gesture.position+dx/innerWidth*Math.min(600,Math.max(60,state.duration)))); feedback('进度 '+clock(gesture.target)) }
  else if (gesture.kind === 'volume') { volume(gesture.volume+dy/innerHeight*1.5); feedback('音量 '+Math.round(state.volume*100)+'%') }
  else { light(gesture.brightness+dy/innerHeight*1.5); feedback('亮度 '+Math.round(brightness*100)+'%') }
})
function endGesture(event) { if (!gesture) return; const moved = gesture.moved; if (event.type!=='pointercancel' && gesture.kind==='seek') seek(gesture.target); if (gesture.kind==='volume') volume(state.volume,true); gesture = null; if (moved) reveal() }
$('stage').addEventListener('pointerup',endGesture); $('stage').addEventListener('pointercancel',endGesture)
document.addEventListener('keydown',event => {
  if (locked || event.target.matches('input,select')) return
  if (['Space','ArrowLeft','ArrowRight','KeyF','Escape','KeyN','KeyP','ArrowUp','ArrowDown'].includes(event.code)) event.preventDefault()
  if (event.code==='Space') toggle()
  if (event.code==='ArrowLeft') seek(state.currentTime-10)
  if (event.code==='ArrowRight') seek(state.currentTime+10)
  if (event.code==='ArrowUp') volume(state.volume+.05)
  if (event.code==='ArrowDown') volume(state.volume-.05)
  if (event.code==='KeyF') command('fullscreen',{value:!state.fullscreen})
  if (event.code==='Escape' && state.fullscreen) command('fullscreen',{value:false})
  if (event.code==='KeyN') command('next')
  if (event.code==='KeyP') command('previous')
  reveal()
})
window.vlc.onState(update => {
  state = {...state,...update}; $('title').textContent = state.title || '本地影库 · LibVLC'
  $('play').textContent = state.paused ? '播放':'暂停'; $('duration').textContent = clock(state.duration)
  if (!dragging) { $('current').textContent = clock(state.currentTime); $('seek').value = state.duration>0 ? Math.round(state.currentTime/state.duration*10000):0 }
  $('volume').value = Math.round((state.volume ?? 1)*100); $('mute').textContent = state.muted ? '取消静音':'静音'; $('rate').value = state.rate || 1
  $('fill').textContent = state.fill ? '适应屏幕':'满屏观影（不裁切）'; $('exit').hidden = !state.fullscreen
  if ((state.events || []).includes('waiting')) feedback('正在缓冲…',10000)
  if ((state.events || []).includes('playing')) { clearTimeout(statusTimer); $('status').textContent = '' }
  if ((state.events || []).includes('ended')) feedback('本集播放结束',5000)
  if (state.error) feedback(state.error,8000)
})
reveal()
