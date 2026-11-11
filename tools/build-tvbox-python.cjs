const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),source=path.join(root,'native/tvbox-python'),output=path.join(root,'static/tvbox-python'),cache=path.join(__dirname,'.android-build/python')
const dependencies=JSON.parse(fs.readFileSync(path.join(source,'dependencies.json'),'utf8'))
const {inspectElf}=require('./python-elf.cjs')
const yauzl=require('../desktop/node_modules/yauzl'),yazl=require('./js-spider/node_modules/yazl')
const digest=data=>crypto.createHash('sha256').update(data).digest('hex')
async function artifact(name,spec){
  const file=path.join(cache,name)
  if(!fs.existsSync(file)){const r=await fetch(spec.url,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error('Python dependency HTTP '+r.status);const data=Buffer.from(await r.arrayBuffer());if(digest(data)!==spec.sha256)throw new Error('Python dependency checksum: '+name);fs.writeFileSync(file,data)}
  const data=fs.readFileSync(file);if(digest(data)!==spec.sha256)throw new Error('Python dependency checksum: '+name);return data
}
function entries(data){return new Promise((resolve,reject)=>yauzl.fromBuffer(data,{lazyEntries:true},(error,zip)=>{
  if(error)return reject(error);const files=[];zip.on('error',reject);zip.on('end',()=>resolve(files))
  zip.on('entry',entry=>{if(entry.fileName.endsWith('/'))return zip.readEntry();zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const parts=[];stream.on('error',reject);stream.on('data',part=>parts.push(part));stream.on('end',()=>{files.push({name:entry.fileName,data:Buffer.concat(parts)});zip.readEntry()})})});zip.readEntry()
}))}
function writeInside(directory,name,data){const file=path.resolve(directory,name);if(!file.startsWith(path.resolve(directory)+path.sep))throw new Error('Invalid Python artifact path');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',windowsHide:true});if(result.error||result.status)throw result.error||new Error('Python JNI build failed')}
async function main(){
  fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(output,{recursive:true})
  const libraries=new yazl.ZipFile(),names=new Set(),notices=[]
  for(const item of dependencies.packages){
    const data=await artifact(item.name+'-'+item.version+'.whl',item)
    for(const entry of await entries(data)){
      if(names.has(entry.name))throw new Error('Duplicate Python dependency entry: '+entry.name)
      names.add(entry.name);libraries.addBuffer(entry.data,entry.name,{mtime:new Date('2000-01-01T00:00:00Z')})
      if(/(?:LICENSE|COPYING|NOTICE)/i.test(entry.name))notices.push(item.name+' '+item.version+'\n'+entry.data.toString('utf8'))
      if(entry.name==='certifi/cacert.pem')fs.writeFileSync(path.join(output,'cacert.pem'),entry.data)
    }
  }
  const requirements=path.join(output,'requirements.zip'),written=new Promise((resolve,reject)=>{const out=fs.createWriteStream(requirements);libraries.outputStream.pipe(out);out.on('close',resolve);out.on('error',reject)})
  libraries.end();await written
  await fs.promises.cp(path.join(source,'python'),path.join(output,'host'),{recursive:true,filter:name=>!/(?:^|[\\/])__pycache__(?:[\\/]|$)|\.pyc$/.test(name)})
  const java=fs.realpathSync(process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/javac.exe'):'C:/Program Files/Common Files/Oracle/Java/javapath/javac.exe'),javaHome=path.dirname(path.dirname(java))
  const zig=path.join(__dirname,'.android-build/ziglang/zig.exe')
  if(!fs.existsSync(zig))throw new Error('缺少项目已有的 Zig 构建工具，请准备 tools/.android-build/ziglang')
  const manifest={...dependencies,packages:undefined,jni:{}}
  for(const [name,abi,target]of [['arm64','arm64-v8a','aarch64-linux-android'],['armv7','armeabi-v7a','arm-linux-android']]){
    const directory=path.join(cache,abi),data=await artifact(name+'.zip',dependencies.artifacts[name])
    for(const entry of await entries(data))writeInside(directory,entry.name,entry.data)
    const native=path.join(output,abi,'liblocalvideo_python.so');fs.mkdirSync(path.dirname(native),{recursive:true})
    // Only portable C declarations are used from these headers. Link no musl
    // runtime: Android resolves libc through the original libpython dependency.
    const arch=name==='arm64'?'aarch64':'arm',headers=path.join(path.dirname(zig),'lib/libc/include')
    // The original Python DSO has no SONAME. A build-only import library keeps
    // Zig from recording a Windows absolute path in DT_NEEDED. This stub is
    // never shipped; the device loads the verified original CPython library.
    const link=path.join(directory,'link-only');fs.mkdirSync(link,{recursive:true})
    const symbols=new Set([...fs.readFileSync(path.join(source,'bridge.c'),'utf8').matchAll(/\b(_?Py[A-Z]\w*)\s*\(/g)].map(match=>match[1]));symbols.add('_Py_Dealloc');symbols.add('PyType_GetFlags')
    const stub=path.join(link,'python-imports.c');fs.writeFileSync(stub,[...symbols].map(name=>'void '+name+'(void) {}').join('\n'))
    const imports=path.join(link,'libpython3.11.so')
    run(zig,['cc','-target',target,'-shared','-nostdlib','-fPIC','-Wl,-soname,libpython3.11.so',stub,'-o',imports])
    run(zig,['cc','-target',target,'-shared','-nostdlib','-fPIC','-O2','-isystem',path.join(headers,arch+'-linux-musl'),'-isystem',path.join(headers,'generic-musl'),'-isystem',path.join(headers,arch+'-linux-any'),'-isystem',path.join(headers,'any-linux-any'),'-Wl,-soname,liblocalvideo_python.so','-Wl,-z,max-page-size=16384','-I'+path.join(javaHome,'include'),'-I'+source,'-I'+path.join(directory,'include/python3.11'),path.join(source,'bridge.c'),imports,'-o',native])
    const compiled=fs.readFileSync(native);manifest.jni[abi]={sha256:digest(compiled),size:compiled.length}
    const elf=inspectElf(compiled)
    if(elf.needed.length!==1||elf.needed[0]!=='libpython3.11.so'||elf.alignments.some(value=>value<16384))throw new Error('Invalid portable Python JNI dependencies/alignment: '+abi)
  }
  // Standard-library archive is verified at build time and downloaded per device.
  await artifact('stdlib.zip',dependencies.artifacts.stdlib)
  const requirementsBytes=fs.readFileSync(requirements)
  manifest.requirements={sha256:digest(requirementsBytes),size:requirementsBytes.length}
  manifest.host={};for(const name of ['localvideo_python_host.py','base/__init__.py','base/spider.py'])manifest.host[name]=digest(fs.readFileSync(path.join(output,'host',name)))
  manifest.certificate=digest(fs.readFileSync(path.join(output,'cacert.pem')))
  fs.writeFileSync(path.join(output,'runtime.json'),JSON.stringify(manifest,null,2)+'\n')
  fs.writeFileSync(path.join(output,'THIRD-PARTY-NOTICES.txt'),'CPython '+dependencies.python+' - Python Software Foundation License Version 2\nTarget binaries: https://repo.maven.apache.org/maven2/com/chaquo/python/target/'+dependencies.python+'-0/\nSource/build recipes: https://github.com/chaquo/chaquopy/tree/main/target\nPython license: https://docs.python.org/3.11/license.html\nNative target includes OpenSSL (Apache-2.0), SQLite (public domain), libffi and zlib.\nThe CPython target and standard library are downloaded from the original publisher and verified before extraction.\n\n'+fs.readFileSync(path.join(source,'Python-LICENSE.txt'),'utf8')+'\n\n'+fs.readFileSync(path.join(root,'static/tvbox-native/Apache-2.0.txt'),'utf8')+'\n\n'+notices.join('\n\n------------------\n\n'))
  const hash=digest(fs.readFileSync(path.join(output,'runtime.json')))
  fs.writeFileSync(path.join(root,'core/tvbox/python-version.js'),"export const PYTHON_RUNTIME_HASH = '"+hash+"'\n")
  console.log('Android Python runtime prepared: '+hash)
}
main().catch(error=>{console.error(error);process.exitCode=1})
