import { getNativeHost, nativeInvoke as invoke } from '../native-host.js'
let agent, serial = 0
function updateAgent() {
  if (agent) return agent
  const { loader, activity } = getNativeHost()
  agent = invoke(invoke(loader, 'loadClass', 'io.localvideo.update.UpdateAgent'), 'newInstance')
  invoke(agent, 'configure', activity)
  return agent
}
export function androidUpdateConfig(config) {
  return JSON.parse(config ? invoke(updateAgent(), 'saveConfig', JSON.stringify(config)) : invoke(updateAgent(), 'getConfig'))
}
export function androidUpdateTask(action, payload = {}, progress = () => {}) {
  return new Promise((resolve, reject) => {
    let native
    try { native = updateAgent() } catch (error) { reject(error); return }
    const id = String(Date.now()) + '-' + (++serial), started = Date.now()
    invoke(native, 'enqueue', id, action, JSON.stringify(payload))
    const poll = () => {
      try {
        const raw = invoke(native, 'poll', id)
        if (raw) { const result = JSON.parse(raw); if (result.ok) resolve(result.body); else reject(new Error(result.error)); return }
        if (action === 'download') progress(JSON.parse(invoke(native, 'getProgress')))
        if (Date.now() - started > (action === 'download' ? 45 * 60 * 1000 : 120000)) { reject(new Error('更新操作超时')); return }
        setTimeout(poll, 300)
      } catch (error) { reject(error) }
    }
    setTimeout(poll, 100)
  })
}
