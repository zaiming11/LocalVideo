// All potentially blocking decoder calls live off Electron's UI thread.
const { parentPort, workerData } = require('node:worker_threads')
const path = require('node:path')
const koffi = require('koffi')
let instance, player, timer, generation = 0, metadata = false, previousState = -1, maxPosition = 0, live = false
try {
  process.env.VLC_PLUGIN_PATH = path.join(workerData.runtime, 'plugins')
  const core = koffi.load(path.join(workerData.runtime, 'libvlccore.dll'))
  const lib = koffi.load(path.join(workerData.runtime, 'libvlc.dll'))
  const bind = (name, result, args) => lib.func(name, result, args)
  const api = {
    create: bind('libvlc_new', 'void *', ['int', 'const char **']),
    release: bind('libvlc_release', 'void', ['void *']),
    newPlayer: bind('libvlc_media_player_new', 'void *', ['void *']),
    releasePlayer: bind('libvlc_media_player_release', 'void', ['void *']),
    path: bind('libvlc_media_new_path', 'void *', ['void *', 'str']),
    location: bind('libvlc_media_new_location', 'void *', ['void *', 'str']),
    option: bind('libvlc_media_add_option', 'void', ['void *', 'str']),
    setMedia: bind('libvlc_media_player_set_media', 'void', ['void *', 'void *']),
    releaseMedia: bind('libvlc_media_release', 'void', ['void *']),
    hwnd: bind('libvlc_media_player_set_hwnd', 'void', ['void *', 'void *']),
    play: bind('libvlc_media_player_play', 'int', ['void *']),
    pause: bind('libvlc_media_player_set_pause', 'void', ['void *', 'int']),
    stop: bind('libvlc_media_player_stop', 'void', ['void *']),
    state: bind('libvlc_media_player_get_state', 'int', ['void *']),
    time: bind('libvlc_media_player_get_time', 'int64', ['void *']),
    length: bind('libvlc_media_player_get_length', 'int64', ['void *']),
    seek: bind('libvlc_media_player_set_time', 'void', ['void *', 'int64']),
    rate: bind('libvlc_media_player_set_rate', 'int', ['void *', 'float']),
    volume: bind('libvlc_audio_set_volume', 'int', ['void *', 'int']),
    mute: bind('libvlc_audio_set_mute', 'void', ['void *', 'int']),
    aspect: bind('libvlc_video_set_aspect_ratio', 'void', ['void *', 'str']),
    scale: bind('libvlc_video_set_scale', 'void', ['void *', 'float']),
    mouse: bind('libvlc_video_set_mouse_input', 'void', ['void *', 'uint']),
    keyboard: bind('libvlc_video_set_key_input', 'void', ['void *', 'uint']),
    err: bind('libvlc_errmsg', 'str', [])
  }
  const options = ['--no-video-title-show', '--avcodec-hw=any', '--no-stats', '--no-osd', '--no-snapshot-preview']
  if(workerData.logFile) options.push('--file-logging','--logfile='+workerData.logFile,'--verbose=1')
  instance = api.create(options.length, options)
  if (!instance) throw new Error(api.err() || 'LibVLC 初始化失败')
  player = api.newPlayer(instance)
  if (!player) throw new Error('无法创建 LibVLC 播放器')
  api.hwnd(player, Buffer.from(workerData.hwnd).readBigUInt64LE())
  api.mouse(player, 0); api.keyboard(player, 0)
  const snapshot = () => {
    const state = api.state(player), time = Math.max(0, Number(api.time(player))) / 1000, duration = live ? 0 : Math.max(0, Number(api.length(player))) / 1000
    maxPosition=Math.max(maxPosition,time)
    const events = []
    if (!metadata && state === 3) { metadata = true; events.push('loadedmetadata') }
    const prematureEnd=state===6 && maxPosition<.25
    if (state !== previousState) {
      if (state === 3) events.push('play', 'playing', 'canplay')
      if (state === 4) events.push('pause')
      if (state === 1 || state === 2) events.push('waiting')
      if (state === 6) events.push(prematureEnd ? 'error':'ended')
      if (state === 7) events.push('error')
      previousState = state
    }
    parentPort.postMessage({ type: 'state', generation, currentTime: time, duration, paused: state !== 3, state, events, error: prematureEnd ? '视频尚未开始便中断，请检查播放线路或重试' : state===7 ? 'LibVLC 无法打开视频，请检查文件或播放线路' : '' })
  }
  parentPort.on('message', message => {
    const { id, action, input = {} } = message
    try {
      let result = true
      if (action === 'open') {
        api.stop(player); generation = input.generation; metadata = false; previousState = -1; maxPosition=0;live=!!input.live
        const media = input.file ? api.path(instance, input.file) : api.location(instance, input.url)
        if (!media) throw new Error(api.err() || '无法打开视频')
        try {
          api.option(media, ':file-caching=500'); api.option(media, ':network-caching=1500'); api.option(media, ':avcodec-hw=any')
          api.setMedia(player, media)
        } finally { api.releaseMedia(media) }
        if (api.play(player) < 0) throw new Error(api.err() || '视频启动失败')
        api.volume(player,Math.round(input.volume*100)); api.mute(player,input.muted ? 1 : 0); api.rate(player,input.rate)
      } else if (action === 'play') { if (api.play(player) < 0) throw new Error(api.err() || '播放失败') }
      else if (action === 'pause') api.pause(player, 1)
      else if (action === 'seek' && !live) { maxPosition=Math.max(maxPosition,input.value);api.seek(player, Math.round(Math.max(0,input.value) * 1000)) }
      else if (action === 'rate') api.rate(player, input.value)
      else if (action === 'volume') { api.volume(player, Math.round(input.value * 100)); api.mute(player, input.muted ? 1 : 0) }
      else if (action === 'fit') { api.aspect(player, input.fill && input.width > 0 && input.height > 0 ? input.width + ':' + input.height : null); api.scale(player, 0) }
      else if (action === 'close') {
        clearInterval(timer); api.stop(player); api.releasePlayer(player); player = null; api.release(instance); instance = null
        parentPort.postMessage({ id, result }); parentPort.close(); return
      } else throw new Error('未知播放操作')
      parentPort.postMessage({ id, result }); snapshot()
    } catch (error) { parentPort.postMessage({ id, error: error.message }) }
  })
  timer = setInterval(snapshot, 250)
  // Retain the DLL handles until after the player has stopped.
  parentPort.on('close', () => { clearInterval(timer); void core; void lib })
  parentPort.postMessage({ type: 'ready' })
} catch (error) { parentPort.postMessage({ type: 'fatal', error: error.message }); parentPort.close() }
