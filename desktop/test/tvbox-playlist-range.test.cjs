const {test}=require('node:test')
const assert=require('node:assert/strict')
const http=require('node:http')
const {mediaUrl,mediaResponse,decodeMediaUrl}=require('../tvbox-network.cjs')

test('206 HLS manifests are read in full and rewrite relative segments and AES keys with headers',async t=>{
  const requests=[],segment=Buffer.from([0x47,0x40,0,0x10]),key=Buffer.alloc(16,7)
  const server=http.createServer((req,res)=>{
    requests.push({url:req.url,range:req.headers.range,referer:req.headers.referer})
    if(req.headers.referer!=='https://player.example/'){res.writeHead(403);res.end();return}
    if(req.url==='/index.m3u8'){
      const body='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:10,\nsegment\n#EXT-X-ENDLIST\n'
      res.writeHead(req.headers.range?206:200,{'Content-Type':'application/vnd.apple.mpegurl',...(req.headers.range?{'Content-Range':`bytes 0-${body.length-1}/${body.length}`}:{})});res.end(body)
    }else if(req.url==='/segment'){res.writeHead(200,{'Content-Type':'video/mp2t'});res.end(segment)}
    else if(req.url==='/key'){res.end(key)}else{res.writeHead(404);res.end()}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close()})
  const origin=`http://127.0.0.1:${server.address().port}`,prefix='http://127.0.0.1:30001/private/'
  const url=mediaUrl(origin+'/index.m3u8',{Referer:'https://player.example/'},true,prefix)
  const response=await mediaResponse(new Request(url,{headers:{Range:'bytes=0-'}}),prefix)
  assert.equal(response.status,200);assert.equal(response.headers.get('content-range'),null)
  const body=await response.text(),keyUrl=/URI="([^"]+)"/.exec(body)[1],segmentUrl=body.split('\n').find(line=>line.startsWith(prefix))
  assert.match(segmentUrl,/\.ts$/);assert.match(keyUrl,/\.key$/)
  assert.equal(decodeMediaUrl(segmentUrl).url,origin+'/segment')
  assert.deepEqual(Buffer.from(await(await mediaResponse(new Request(segmentUrl),prefix)).arrayBuffer()),segment)
  assert.deepEqual(Buffer.from(await(await mediaResponse(new Request(keyUrl),prefix)).arrayBuffer()),key)
  assert.equal(requests[0].range,'bytes=0-');assert.equal(requests[1].range,undefined)
  assert.ok(requests.every(item=>item.referer==='https://player.example/'))
})
