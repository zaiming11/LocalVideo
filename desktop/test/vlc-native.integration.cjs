// Run explicitly with Electron on Windows; does not use the user's profile.
const {app,BrowserWindow}=require('electron')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http')
const {spawnSync}=require('node:child_process')
const {Readable}=require('node:stream')
const {VlcPlayer}=require('../vlc-player.cjs')
const {fileResponse}=require('../media-library.cjs')
const {mediaUrl}=require('../tvbox-network.cjs')
const work=fs.mkdtempSync(path.join(os.tmpdir(),'localvideo-vlc-check-'))
fs.mkdirSync(path.join(work,'profile'));app.setPath('userData',path.join(work,'profile'))
let player,owner,server,lastState,failed
const trace=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,label){const deadline=Date.now()+25000;while(Date.now()<deadline){if(failed)throw new Error(failed);if(check())return;await delay(100)}throw new Error(label+' timeout: '+JSON.stringify(lastState))}
async function close(){await player?.close();server?.closeAllConnections();server?.close()}
app.whenReady().then(async()=>{
  const sample=process.env.VLC_TEST_SAMPLE||path.resolve(__dirname,'../../static/demo/videos/night-flight.mp4')
  const ffmpeg=spawnSync(process.env.VLC_TEST_FFMPEG||'ffmpeg',['-v','error','-i',sample,'-c','copy','-hls_time','4','-hls_list_size','0',path.join(work,'stream.m3u8')],{encoding:'utf8',windowsHide:true})
  if(ffmpeg.status)throw new Error(ffmpeg.stderr||String(ffmpeg.error))
  let requests=0
  server=http.createServer(async(req,res)=>{
    if(req.headers.referer!=='https://localvideo.test/'){res.writeHead(403);res.end();return}
    requests++;fs.appendFileSync(path.join(work,'requests.log'),req.method+' '+new URL(req.url,'http://localhost').pathname+'\n')
    const name=new URL(req.url,'http://localhost').pathname.slice(1)
    if(!/^(stream\.m3u8|stream\d+\.ts)$/.test(name)){res.writeHead(404);res.end();return}
    const response=await fileResponse(new Request('http://localhost/'+name,{headers:req.headers,method:req.method}),path.join(work,name),name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t')
    res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end()
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  owner=new BrowserWindow({title:'LocalVideo · VLC 嵌入验证',width:1000,height:700,backgroundColor:'#000000',webPreferences:{sandbox:true,contextIsolation:true}})
  owner.removeMenu()
  await owner.loadURL('data:text/html,<body style="background:black"></body>')
  player=new VlcPlayer({owner,library:{resolve:src=>src==='localmedia://library/fixture'?sample:null}})
  player.notify=data=>{if(data.type==='error')failed=data.error;if(data.type==='state'){lastState=data;if(data.error)failed=data.error;if(trace.at(-1)?.state!==data.state)trace.push({generation:data.generation,state:data.state,time:data.currentTime,events:data.events})}}
  const input={title:'LibVLC 嵌入播放验证',volume:0,muted:true,rate:1,fill:false,queue:[{id:'fixture',title:'播放验证'}],currentId:'fixture'}
  await player.open({...input,src:'localmedia://library/fixture',generation:1})
  await until(()=>lastState?.generation===1&&lastState.state===3&&lastState.currentTime>=2,'local MP4 playback')
  const surface=player.surface
  if(player.window!==owner||surface.api.getParent(surface.hwnd)!==surface.parent||surface.api.getWindow(surface.hudHandle,4)!==surface.parent)throw new Error('Video/HUD not owned by the main window')
  if(BigInt(surface.api.getStyle(surface.hudHandle,-16))&0x40000000n)throw new Error('Transparent HUD must not use WS_CHILD')
  await player.command('seek',{value:8})
  await until(()=>lastState.currentTime>=8,'local seek')
  await player.command('pause');await until(()=>lastState.state===4,'pause')
  await player.open({...input,src:mediaUrl(`http://127.0.0.1:${server.address().port}/stream.m3u8`,{referer:'https://localvideo.test/'},true),generation:2})
  await until(()=>lastState?.generation===2&&lastState.state===3&&lastState.currentTime>=2,'header protected HLS playback')
  if(requests<2)throw new Error('HLS segment requests were not forwarded')
  await player.command('pause');await until(()=>lastState.state===4,'HLS pause')
  const geometry=async()=>({owner:owner.getBounds(),content:owner.getContentBounds(),hud:player.hud.getBounds(),viewport:await player.hud.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'),fullscreen:owner.isFullScreen(),hudFullscreen:player.hud.isFullScreen(),hudMaximized:player.hud.isMaximized(),style:String(surface.api.getStyle(surface.hudHandle,-16))})
  const layouts=[]
  async function checkLayout(label){
    await until(()=>{const a=owner.getContentBounds(),b=player.hud.getBounds();return ['x','y','width','height'].every(key=>Math.abs(a[key]-b[key])<=1)},label+' HUD bounds')
    await delay(100)
    const value=await geometry()
    if(Math.abs(value.viewport.width-value.content.width)>1||Math.abs(value.viewport.height-value.content.height)>1)throw new Error(label+' viewport mismatch: '+JSON.stringify(value))
    layouts.push({label,...value})
  }
  await checkLayout('normal')
  owner.setBounds({x:120,y:90,width:860,height:620});await checkLayout('move/resize')
  const position=lastState.currentTime
  for(let i=0;i<2;i++){
    const normalBounds=owner.getBounds()
    owner.setFullScreen(true);await until(()=>owner.isFullScreen()&&owner.getBounds().width>normalBounds.width,'enter fullscreen');await checkLayout('fullscreen '+i)
    owner.setFullScreen(false);await until(()=>!owner.isFullScreen()&&owner.getBounds().width===normalBounds.width,'exit fullscreen');await checkLayout('restored '+i)
  }
  if(lastState.state!==4||Math.abs(lastState.currentTime-position)>.5)throw new Error('Fullscreen transition changed playback position/state')
  const report={ok:true,work,requests,trace,embedded:true,packaged:app.isPackaged,layouts}
  fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2))
  if(process.env.VLC_TEST_REPORT)fs.writeFileSync(process.env.VLC_TEST_REPORT,JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
  if(process.argv.includes('--hold')){setTimeout(()=>{close().finally(()=>app.quit())},Math.min(900000,Math.max(1000,Number(process.env.VLC_TEST_HOLD_MS)||120000)))}else{await close();app.quit()}
}).catch(async error=>{const report={ok:false,error:error.stack,work,trace};fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));if(process.env.VLC_TEST_REPORT)fs.writeFileSync(process.env.VLC_TEST_REPORT,JSON.stringify(report,null,2));console.error(JSON.stringify(report));try{await close()}catch{}app.exit(1)})
app.on('window-all-closed',()=>{close().finally(()=>app.quit())})
