// Exercise the production ASAR + unpacked native dependency/resource layout.
// Creates an isolated temporary app, never an installer or a published artifact.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {spawn}=require('node:child_process')
const root=path.resolve(__dirname,'..'),desktop=path.join(root,'desktop')
async function main(){
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'localvideo-vlc-bundle-')),runtime=path.join(work,'runtime'),resources=path.join(runtime,'resources'),source=path.join(work,'source'),report=path.join(work,'report.json')
  await fs.promises.cp(path.join(desktop,'node_modules/electron/dist'),runtime,{recursive:true})
  fs.renameSync(path.join(runtime,'electron.exe'),path.join(runtime,'LocalVideoVlcCheck.exe'))
  fs.mkdirSync(source,{recursive:true});fs.mkdirSync(path.join(source,'test'))
  for(const file of ['vlc-player.cjs','vlc-embedding.cjs','vlc-worker.cjs','vlc-preload.cjs','vlc-controls.html','vlc-controls.css','vlc-controls.js','media-library.cjs','tvbox-network.cjs'])fs.copyFileSync(path.join(desktop,file),path.join(source,file))
  fs.copyFileSync(path.join(desktop,'test/vlc-native.integration.cjs'),path.join(source,'test/vlc-native.integration.cjs'))
  for(const name of ['koffi','@koromix/koffi-win32-x64'])await fs.promises.cp(path.join(desktop,'node_modules',name),path.join(source,'node_modules',name),{recursive:true})
  fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'localvideo-vlc-check',version:'1.0.0',main:'test/vlc-native.integration.cjs'}))
  await fs.promises.cp(path.join(desktop,'vlc-runtime'),path.join(resources,'vlc-runtime'),{recursive:true})
  fs.copyFileSync(path.join(root,'static/demo/videos/night-flight.mp4'),path.join(resources,'fixture.mp4'))
  await require('../desktop/node_modules/@electron/asar').createPackageWithOptions(source,path.join(resources,'app.asar'),{unpack:'**/*.node',unpackDir:'{node_modules/koffi,node_modules/@koromix/koffi-win32-x64}'})
  const env={...process.env,VLC_TEST_SAMPLE:path.join(resources,'fixture.mp4'),VLC_TEST_REPORT:report};delete env.ELECTRON_RUN_AS_NODE
  const code=await new Promise((resolve,reject)=>{const child=spawn(path.join(runtime,'LocalVideoVlcCheck.exe'),process.argv.includes('--hold')?['--hold']:[],{env,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve)})
  const result=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):{ok:false,error:'Packaged fixture did not write a report'}
  console.log(JSON.stringify({bundle:work,exitCode:code,...result}))
  if(code||!result.ok||!result.packaged)process.exitCode=1
  else {
    const relative=path.relative(fs.realpathSync(os.tmpdir()),fs.realpathSync(work))
    if(path.isAbsolute(relative)||relative.includes(path.sep)||!relative.startsWith('localvideo-vlc-bundle-'))throw new Error('Invalid temporary bundle cleanup target')
    fs.rmSync(work,{recursive:true,force:true})
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
