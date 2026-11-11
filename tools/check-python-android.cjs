// Run the production DEX/JNI/CPython on a connected ARM Android device through
// app_process. No APK, app-data access or foreground activity is involved.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),cache=path.join(__dirname,'.android-build'),assets=path.join(root,'static/tvbox-python')
const manifestBytes=fs.readFileSync(path.join(assets,'runtime.json')),manifest=JSON.parse(manifestBytes),hash=require('node:crypto').createHash('sha256').update(manifestBytes).digest('hex')
const javaBin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'C:/Program Files/Common Files/Oracle/Java/javapath'
const serial=process.argv[2];if(!serial||!/^[\w.:-]+$/.test(serial))throw new Error('Usage: node tools/check-python-android.cjs <device-serial> [python-source-url]')
const device='/data/local/tmp/localvideo-python-check-'+Date.now(),work=path.join(cache,'python/check-'+Date.now())
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});if(result.status||result.error)throw new Error(result.stderr||result.stdout||String(result.error));return result.stdout}
const adb=(...args)=>run('adb',['-s',serial,...args])
let created=false
try{
  const deviceAbi=adb('shell','getprop','ro.product.cpu.abi').trim(),abi=deviceAbi==='arm64-v8a'?'arm64-v8a':deviceAbi==='armeabi-v7a'?'armeabi-v7a':null
  if(!abi)throw new Error('ARM Android device required')
  fs.mkdirSync(work,{recursive:true});const classes=path.join(work,'classes');fs.mkdirSync(classes)
  const sdk=path.join(cache,'android35.jar'),sources=['PythonNativeBootstrap.java','PythonNativeCheck.java'].map(name=>path.join(__dirname,'fixtures',name))
  run(path.join(javaBin,'javac.exe'),['-encoding','UTF-8','--release','8','-classpath',[sdk,path.join(cache,'classes')].join(path.delimiter),'-d',classes,...sources])
  const compiled=fs.readdirSync(classes).filter(name=>name.endsWith('.class')).map(name=>path.join(classes,name)),dex=path.join(work,'check.jar')
  run(path.join(javaBin,'java.exe'),['-cp',path.join(cache,'r8.jar'),'com.android.tools.r8.D8','--min-api','24','--lib',sdk,'--output',dex,...compiled])
  adb('shell','mkdir','-p',device+'/cache/python-artifacts');created=true
  adb('push',dex,device+'/check.jar');adb('push',path.join(root,'static/tvbox-native/bridge.jar'),device+'/bridge.jar')
  adb('push',assets,device+'/assets')
  const spec=manifest.artifacts[abi==='arm64-v8a'?'arm64':'armv7']
  if(!process.argv.includes('--download')){
    adb('push',path.join(cache,'python',abi==='arm64-v8a'?'arm64.zip':'armv7.zip'),device+'/cache/python-artifacts/'+spec.sha256+'.zip')
    adb('push',path.join(cache,'python/stdlib.zip'),device+'/cache/python-artifacts/'+manifest.artifacts.stdlib.sha256+'.zip')
  }
  adb('shell','chmod','444',device+'/bridge.jar',device+'/check.jar')
  const args=['shell','env','CLASSPATH='+device+'/check.jar','app_process','/system/bin','PythonNativeBootstrap',device,hash,abi]
  const source=process.argv.slice(3).find(value=>value!=='--download')
  if(source){if(!/^https?:\/\/[^\s'"`$;]+\.py(?:[?#][^\s'"`$;]*)?$/.test(source))throw new Error('Invalid Python source URL');args.push(source)}
  const result=adb(...args);fs.writeFileSync(path.join(work,'result.log'),result);console.log(result)
  if(!result.includes('PYTHON_NATIVE_FIXTURE_OK'))throw new Error('Native fixture did not pass')
}finally{
  if(created&&/^\/data\/local\/tmp\/localvideo-python-check-\d+$/.test(device))adb('shell','rm','-rf',device)
}
