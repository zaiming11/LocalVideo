// Live JS-source diagnostic, isolated profile and sandbox; no installer/device.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http')
const {spawn,spawnSync}=require('node:child_process')
const crypto=require('node:crypto')
const root=path.resolve(__dirname,'..')
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const child=spawn(path.join(root,'desktop/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit'})
  child.on('exit',code=>{process.exitCode=code||0});child.on('error',error=>{console.error(error);process.exitCode=1})
}else{
  const {app,BrowserWindow,ipcMain}=require('electron')
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'localvideo-js-check-'))
  app.setPath('userData',path.join(work,'profile'))
  let window,server
  const pending=new Map(),storage=new Map()
  const sdk=path.join(root,'tools/.android-build/android35.jar'),json=path.join(root,'tools/.android-build/json-20240303.jar')
  const javaBin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'C:/Program Files/Common Files/Oracle/Java/javapath'
  const cp=[work,json,sdk].join(path.delimiter)
  async function main(){
    if(!fs.existsSync(json)){
      const response=await fetch('https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar',{signal:AbortSignal.timeout(20000)})
      if(!response.ok)throw new Error('JVM test JSON dependency HTTP '+response.status)
      const data=Buffer.from(await response.arrayBuffer())
      if(crypto.createHash('sha256').update(data).digest('hex')!=='3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed')throw new Error('JVM test JSON dependency checksum mismatch')
      fs.writeFileSync(json,data)
    }
    if(crypto.createHash('sha256').update(fs.readFileSync(json)).digest('hex')!=='3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed')throw new Error('JVM test JSON dependency checksum mismatch')
    const compile=spawnSync(path.join(javaBin,'javac.exe'),['-encoding','UTF-8','--release','8','-classpath',[json,sdk].join(path.delimiter),'-d',work,path.join(root,'tools/fixtures/SpiderRequest.java'),...['SpiderHttp.java','HttpTransport.java'].map(name=>path.join(root,'native/tvbox/src/io/localvideo/tvbox',name))],{encoding:'utf8',windowsHide:true})
    if(compile.status)throw new Error(compile.stderr||String(compile.error))
    const configUrl=process.argv[2];if(!/^https?:\/\//.test(configUrl||''))throw new Error('Usage: node tools/check-tvbox-js.cjs <configuration-url> [site-key]')
    const response=await fetch(configUrl,{headers:{'User-Agent':'okhttp/3.12.13'},signal:AbortSignal.timeout(20000)})
    if(!response.ok)throw new Error('Config HTTP '+response.status)
    const config=JSON.parse(await response.text())
    const selected=config.sites.find(site=>Number(site.type)===3&&/\.m?js(?:[?#]|$)/i.test(site.api)&&(!process.argv[3]||site.key===process.argv[3]))
    if(!selected)throw new Error('No matching JS site')
    const api=new URL(selected.api,response.url).href,ext=typeof selected.ext==='string'&&/^\.?\.?\//.test(selected.ext)?new URL(selected.ext,response.url).href:selected.ext
    const siteHeaders=selected.header||selected.headers||{}
    server=http.createServer((req,res)=>{
      const name=req.url.slice(1).split('?')[0]
      if(!['libraries.js','runtime.js','cheerio.js','crypto-js.js'].includes(name)){res.writeHead(404);res.end();return}
      res.writeHead(200,{'Content-Type':'application/javascript','Access-Control-Allow-Origin':'*'});res.end(fs.readFileSync(path.join(root,'static/tvbox-js',name)))
    })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const origin='http://127.0.0.1:'+server.address().port+'/'
    window=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,preload:path.join(__dirname,'fixtures/js-spider-preload.cjs'),backgroundThrottling:false}})
    const trusted=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame
    ipcMain.on('spider:request',(event,url,options)=>{
      if(!trusted(event)){event.returnValue='{"error":"Invalid sender"}';return}
      const parsed=JSON.parse(options);parsed.headers={...siteHeaders,...parsed.headers}
      const result=spawnSync(path.join(javaBin,'java.exe'),['-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',cp,'SpiderRequest',url,JSON.stringify(parsed)],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:10*1024*1024})
      event.returnValue=result.status===0?result.stdout:JSON.stringify({error:result.stderr||result.error?.message||'Native HTTP failed'})
    })
    ipcMain.on('spider:storage',(event,action,namespace,key,value)=>{if(!trusted(event)){event.returnValue='';return}const id=namespace+'\0'+key;if(action==='set')storage.set(id,value);if(action==='delete')storage.delete(id);event.returnValue=storage.get(id)||''})
    ipcMain.on('spider:complete',(event,id,value,error)=>{if(!trusted(event))return;const reply=pending.get(id);pending.delete(id);if(reply){clearTimeout(reply.timer);error?reply.reject(new Error(error)):reply.resolve(JSON.parse(value))}})
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault())
    if(process.env.JS_SPIDER_VERBOSE==='1')window.webContents.on('console-message',(_event,...args)=>{const value=typeof args[1]==='string'?args[1]:_event.message;if(value)console.log('Spider: '+value.slice(0,800))})
    window.webContents.session.webRequest.onBeforeSendHeaders((details,callback)=>callback({requestHeaders:{...details.requestHeaders,'User-Agent':'okhttp/3.12.13',...siteHeaders}}))
    window.webContents.session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Access-Control-Allow-Origin':['*']}}))
    const wait=id=>{const promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(id+' timed out'))},55000);pending.set(id,{resolve,reject,timer})});promise.catch(()=>{});return promise}
    const ready=wait('ready'),settings=JSON.stringify({api,ext,proxy:origin+'proxy?do=js&js=fixture'}).replace(/</g,'\\u003c')
    const imports=JSON.stringify({imports:{'assets://js/lib/cheerio.min.js':origin+'cheerio.js','assets://js/lib/crypto-js.js':origin+'crypto-js.js'}})
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<script type=importmap>'+imports+'</script><script type=module>import {start} from '+JSON.stringify(origin+'runtime.js')+';start('+settings+');</script>'))
    await ready
    console.log('JS engine initialized')
    async function invoke(action,args={}){const result=wait(action);await window.webContents.executeJavaScript('globalThis.__localvideoInvoke('+JSON.stringify(action)+','+JSON.stringify(action)+','+JSON.stringify(args)+')');return result}
    const home=await invoke('home'),categoryId=home.class?.[0]?.type_id
    console.log('Home categories: '+(home.class?.length||0))
    const result={site:selected.name,api,initialized:true,categories:home.class?.length||0,recommendations:home.list?.length||0,...(home.sourceWarning?{sourceWarning:home.sourceWarning}:{})}
    if(categoryId){try{const category=await invoke('category',{id:categoryId,page:1});result.categoryItems=category.list?.length||0;result.category=categoryId}catch(error){result.categoryError=error.message}}
    console.log(JSON.stringify(result));fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(result,null,2))
  }
  app.whenReady().then(main).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{window?.destroy();server?.closeAllConnections();server?.close();app.exit(process.exitCode||0)})
}
