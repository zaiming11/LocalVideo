// Explicit on-device integration fixture. Never imported by the application.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {Readable} from 'node:stream'
import {fileURLToPath} from 'node:url'
import media from '../desktop/media-library.cjs'
const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.TVBOX_SPIDER_PORT)||8873,base='http://127.0.0.1:'+port,requests=[]
const movie={vod_id:'fixture',vod_name:'原生 Spider 验证 · 夜航',vod_pic:base+'/poster.svg',vod_remarks:'本机 20 秒测试素材',vod_content:'验证 Python/JS 分类、搜索、选集与 LibVLC 播放。',vod_play_from:'MP4',vod_play_url:'第一集$opaque-1#第二集$opaque-2'}
const js=`let base='';export default {init(ext){base=ext;},home(){return req(base+'/api').content;},category(id,page){return req(base+'/api?t='+id+'&pg='+page).content;},search(keyword,quick,page){return req(base+'/api?wd='+encodeURIComponent(keyword)+'&pg='+page).content;},detail(id){return req(base+'/api?ids='+id).content;},play(flag,id){return {parse:0,url:base+'/video.mp4?episode='+encodeURIComponent(id),header:{Referer:'https://fixture.example/'}};}};`
const py=`from base.spider import Spider as Base
class Spider(Base):
 def init(self,ext=''):
  self.base=ext
 def homeContent(self,filter):
  return self.fetch(self.base+'/api').json()
 def categoryContent(self,tid,pg,filter,extend):
  return self.fetch(self.base+'/api',params={'t':tid,'pg':pg}).json()
 def searchContent(self,key,quick,pg='1'):
  return self.fetch(self.base+'/api',params={'wd':key,'pg':pg}).json()
 def detailContent(self,ids):
  return self.fetch(self.base+'/api',params={'ids':ids[0]}).json()
 def playerContent(self,flag,id,vipFlags):
  return {'parse':0,'url':self.base+'/video.mp4?episode='+id,'header':{'Referer':'https://fixture.example/'}}
`
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,base);requests.push({path:url.pathname,query:url.search,range:req.headers.range,referer:req.headers.referer})
  const json=value=>res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value))
  if(url.pathname==='/config.json')return json({sites:[{key:'python-fixture',name:'Python 原生验证',type:3,api:base+'/spider.py',ext:base},{key:'js-fixture',name:'JS 原生验证',type:3,api:base+'/spider.js',ext:base}]})
  if(url.pathname==='/api')return json({class:[{type_id:'1',type_name:'测试分类'}],page:Number(url.searchParams.get('pg'))||1,pagecount:1,list:[movie]})
  if(url.pathname==='/metrics')return json(requests)
  if(url.pathname==='/spider.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(js);return}
  if(url.pathname==='/spider.py'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end(py);return}
  if(url.pathname==='/poster.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="450"><rect width="320" height="450" fill="#142c35"/><circle cx="220" cy="130" r="55" fill="#25a9b7"/><text x="35" y="320" font-family="sans-serif" fill="white" font-size="25">SPIDER TEST</text></svg>');return}
  if(url.pathname==='/video.mp4'){
    if(req.headers.referer!=='https://fixture.example/'){res.writeHead(403);res.end();return}
    const response=await media.fileResponse(new Request(url.href,{method:req.method,headers:req.headers}),path.join(root,'static/demo/videos/night-flight.mp4'),'video/mp4')
    res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return
  }
  res.writeHead(404);res.end()
})
server.listen(port,'127.0.0.1',()=>console.log(base+'/config.json'))
