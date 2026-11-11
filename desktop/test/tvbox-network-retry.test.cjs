const {test}=require('node:test')
const assert=require('node:assert/strict')
const http=require('node:http')
const zlib=require('node:zlib')
const {requestText,mediaUrl,mediaResponse}=require('../tvbox-network.cjs')

test('TVBox metadata and poster headers retry a disconnect once, preserving image headers and source URLs',async t=>{
  const counts=new Map(),seen=[]
  // A generated one-pixel fixture; no third-party poster content is used.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
  const server=http.createServer((req,res)=>{
    const key=req.url,count=(counts.get(key)||0)+1;counts.set(key,count);seen.push({url:key,referer:req.headers.referer})
    if(key.startsWith('/broken')||count===1&&['/config','/poster.png?signature=unchanged'].includes(key)){req.socket.destroy();return}
    if(key==='/denied'){res.writeHead(403);res.end();return}
    if(key==='/gzip'){
      res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'})
      res.end(count===1?Buffer.from([31,139]):zlib.gzipSync(Buffer.from('{"class":[],"list":[]}')));return
    }
    if(key==='/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"class":[],"list":[]}');return}
    if(key==='/poster.png?signature=unchanged'){
      if(req.headers.referer!=='https://source.example/'){res.writeHead(403);res.end();return}
      res.writeHead(200,{'Content-Type':'image/png','Content-Length':png.length});res.end(png);return
    }
    res.writeHead(404);res.end()
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(()=>{server.closeAllConnections();server.close()})
  const origin='http://127.0.0.1:'+server.address().port,prefix='/__tvbox/media/'
  assert.equal((await requestText(origin+'/config',{},true)).body,'{"class":[],"list":[]}')
  assert.equal(counts.get('/config'),2)
  assert.equal((await requestText(origin+'/gzip',{},true)).body,'{"class":[],"list":[]}')
  assert.equal(counts.get('/gzip'),2)
  await assert.rejects(()=>requestText(origin+'/broken',{},true),/连接被重置或中断/)
  assert.equal(counts.get('/broken'),2)
  await assert.rejects(()=>requestText(origin+'/denied',{},true),/HTTP 403/)
  assert.equal(counts.get('/denied'),1)
  const poster=origin+'/poster.png?signature=unchanged'
  const proxy=mediaUrl(poster,{Referer:'https://source.example/'},true,prefix)
  const response=await mediaResponse(new Request('http://localhost'+proxy),prefix)
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),png)
  assert.equal(counts.get('/poster.png?signature=unchanged'),2)
  assert(seen.filter(item=>item.url.startsWith('/poster')).every(item=>item.referer==='https://source.example/'))
  const aborted=new AbortController();aborted.abort()
  const cancelled=await mediaResponse(new Request('http://localhost'+mediaUrl(origin+'/broken-cancelled',{},true,prefix),{signal:aborted.signal}),prefix)
  assert.equal(cancelled.status,502);assert.equal(counts.get('/broken-cancelled'),undefined)
})
