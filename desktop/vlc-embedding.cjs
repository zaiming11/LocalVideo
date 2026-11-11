// Video is a native child. The transparent HUD stays an owned popup so DWM
// can composite its alpha; reparenting Chromium to WS_CHILD makes it opaque.
const koffi = require('koffi')
const { screen } = require('electron')
let api
function win32() {
  if (api) return api
  const user = koffi.load('user32.dll')
  const rect = koffi.struct('LocalVideoClientRect', { left:'long',top:'long',right:'long',bottom:'long' })
  const point = koffi.struct('LocalVideoClientPoint', { x:'long',y:'long' })
  const fn = (name,result,args) => user.func(name,result,args)
  api = {
    create:fn('CreateWindowExW','void *',['uint32','str16','str16','uint32','int','int','int','int','void *','void *','void *','void *']),
    getParent:fn('GetParent','void *',['void *']),
    getWindow:fn('GetWindow','void *',['void *','uint']),
    getStyle:fn('GetWindowLongPtrW','intptr_t',['void *','int']),
    bounds:fn('SetWindowPos','bool',['void *','void *','int','int','int','int','uint']),
    client:fn('GetClientRect','bool',['void *',koffi.out(koffi.pointer(rect))]),
    origin:fn('ClientToScreen','bool',['void *',koffi.inout(koffi.pointer(point))]),
    show:fn('ShowWindow','bool',['void *','int']),
    destroy:fn('DestroyWindow','bool',['void *']),
    valid:fn('IsWindow','bool',['void *'])
  }
  return api
}
class EmbeddedVlcSurface {
  constructor(owner) {
    this.owner=owner; this.api=win32(); this.parent=owner.getNativeWindowHandle().readBigUInt64LE()
    // STATIC is a system class; LibVLC creates its video output as a child of it.
    this.hwnd=this.api.create(0,'STATIC','',0x46000004,0,0,1,1,this.parent,null,null,null)
    if (!this.hwnd) throw new Error('无法创建嵌入式视频画面')
    this.align()
  }
  handle() { const result=Buffer.alloc(8); result.writeBigUInt64LE(this.hwnd); return result }
  attachHud(hud) {
    this.hud=hud; this.hudHandle=hud.getNativeWindowHandle().readBigUInt64LE()
    // BrowserWindow({ parent }) already sets GW_OWNER. Do not call SetParent
    // or change WS_POPUP: transparent Chromium windows need top-level DWM
    // composition. The HUD has no frame/taskbar entry and follows the client.
    if (this.api.getWindow(this.hudHandle,4)!==this.parent) throw new Error('视频控制层未能关联应用')
    this.align()
  }
  align() {
    if (!this.hwnd || this.owner.isDestroyed()) return null
    const rect={}; if (!this.api.client(this.parent,rect)) return null
    const width=Math.max(1,rect.right),height=Math.max(1,rect.bottom)
    this.api.bounds(this.hwnd,null,0,0,width,height,0x0210)
    if (this.hud && !this.hud.isDestroyed()) {
      const origin={x:0,y:0}
      // Keep Chromium's viewport and its fixed-size constraints synchronized.
      // SetWindowPos on the HUD bypasses Electron's bookkeeping and leaves it
      // stuck at full-screen size when the owner returns to a normal window.
      if (this.api.origin(this.parent,origin)) this.hud.setBounds(screen.screenToDipRect(this.owner,{x:origin.x,y:origin.y,width,height}),false)
    }
    return {width,height}
  }
  visible(value) {
    if (!this.hwnd) return
    this.api.show(this.hwnd,value ? 4:0)
    if (this.hud && !this.hud.isDestroyed()) {
      if (value) { this.hud.showInactive(); this.align() } else this.hud.hide()
    }
  }
  destroy() {
    if (this.hwnd && this.api.valid(this.hwnd)) this.api.destroy(this.hwnd)
    this.hwnd=null; this.hud=null
  }
}
module.exports={EmbeddedVlcSurface}
