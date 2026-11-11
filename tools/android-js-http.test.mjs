import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=fileURLToPath(new URL('../',import.meta.url)),cache=path.join(root,'tools/.android-build')
const json=path.join(cache,'json-20240303.jar')
const javaBin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'C:/Program Files/Common Files/Oracle/Java/javapath'
test('native JS req handles GET/POST, form/JSON bodies, binary/gzip, non-200 responses and redirect credentials',{skip:!fs.existsSync(json)||!fs.existsSync(path.join(javaBin,'javac.exe'))},t=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'localvideo-js-http-'));t.after(()=>fs.rmSync(work,{recursive:true,force:true}))
  const stub=path.join(work,'android/util/Base64.java');fs.mkdirSync(path.dirname(stub),{recursive:true});fs.writeFileSync(stub,'package android.util; public class Base64 {public static final int NO_WRAP=2; public static String encodeToString(byte[] value,int flags){return java.util.Base64.getEncoder().encodeToString(value);}}')
  const source=path.join(work,'SpiderHttpCheck.java')
  fs.writeFileSync(source,`
import com.sun.net.httpserver.*;import java.net.*;import java.io.*;import java.util.*;import java.util.zip.*;
import org.json.*;import io.localvideo.tvbox.SpiderHttp;
public class SpiderHttpCheck {
  static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
  static byte[] read(InputStream in)throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] p=new byte[1024];int n;while((n=in.read(p))!=-1)b.write(p,0,n);return b.toByteArray();}
  static void respond(HttpExchange e,int status,byte[] bytes)throws IOException{e.sendResponseHeaders(status,bytes.length);try(OutputStream out=e.getResponseBody()){out.write(bytes);}}
  public static void main(String[] args)throws Exception{
    HttpServer a=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0),b=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    String base="http://127.0.0.1:"+a.getAddress().getPort(),other="http://127.0.0.1:"+b.getAddress().getPort();
    java.util.concurrent.atomic.AtomicInteger attempts=new java.util.concurrent.atomic.AtomicInteger();
    a.createContext("/echo",e->{try{JSONObject r=new JSONObject().put("method",e.getRequestMethod()).put("body",new String(read(e.getRequestBody()),"UTF-8")).put("type",e.getRequestHeaders().getFirst("Content-Type"));respond(e,200,r.toString().getBytes("UTF-8"));}catch(Exception x){throw new IOException(x);}});
    a.createContext("/missing",e->respond(e,404,"missing".getBytes("UTF-8")));
    a.createContext("/gzip",e->{ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(GZIPOutputStream out=new GZIPOutputStream(bytes)){out.write("中文响应".getBytes("UTF-8"));}e.getResponseHeaders().set("Content-Encoding","gzip");respond(e,200,bytes.toByteArray());});
    a.createContext("/flaky",e->{ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(GZIPOutputStream out=new GZIPOutputStream(bytes)){out.write("recovered".getBytes("UTF-8"));}e.getResponseHeaders().set("Content-Encoding","gzip");respond(e,200,attempts.incrementAndGet()==1?new byte[]{31,-117}:bytes.toByteArray());});
    a.createContext("/broken",e->{attempts.incrementAndGet();e.getResponseHeaders().set("Content-Encoding","gzip");respond(e,200,new byte[]{31,-117});});
    a.createContext("/redirect",e->{read(e.getRequestBody());e.getResponseHeaders().set("Location",other+"/sink");e.sendResponseHeaders(302,-1);e.close();});
    b.createContext("/sink",e->{boolean safe=e.getRequestHeaders().getFirst("Cookie")==null&&e.getRequestHeaders().getFirst("Authorization")==null&&e.getRequestMethod().equals("GET");respond(e,safe?200:403,"OK".getBytes("UTF-8"));});
    a.start();b.start();try{
      JSONObject form=new JSONObject().put("method","POST").put("data",new JSONObject().put("name","中文"));
      JSONObject r=new JSONObject(SpiderHttp.request(base+"/echo",form,null).getString("content"));check(r.getString("method").equals("POST"),"POST lost");check(r.getString("body").equals("name=%E4%B8%AD%E6%96%87"),"Form encoding lost");
      JSONObject json=new JSONObject().put("method","POST").put("postType","json").put("body",new JSONObject().put("name","中文"));
      r=new JSONObject(SpiderHttp.request(base+"/echo",json,null).getString("content"));check(new JSONObject(r.getString("body")).getString("name").equals("中文"),"JSON body lost");check(r.getString("type").startsWith("application/json"),"JSON content type lost");
      check(SpiderHttp.request(base+"/missing",new JSONObject(),null).getInt("code")==404,"HTTP error code lost");
      check(SpiderHttp.request(base+"/gzip",new JSONObject(),null).getString("content").equals("中文响应"),"gzip lost");
      String binary=SpiderHttp.request(base+"/gzip",new JSONObject().put("buffer",2),null).getString("content");check(new String(java.util.Base64.getDecoder().decode(binary),"UTF-8").equals("中文响应"),"binary lost");
      JSONObject redir=new JSONObject().put("method","POST").put("body","data").put("headers",new JSONObject().put("Cookie","fixture").put("Authorization","fixture"));
      check(SpiderHttp.request(base+"/redirect",redir,null).getInt("code")==200,"Redirect leaked credentials or method");
      check(SpiderHttp.request(base+"/redirect",new JSONObject().put("redirect",0),null).getInt("code")==302,"redirect=0 lost");
      attempts.set(0);check(SpiderHttp.request(base+"/flaky",new JSONObject(),null).getString("content").equals("recovered")&&attempts.get()==2,"JS GET did not retry once");
      attempts.set(0);check(io.localvideo.tvbox.HttpTransport.get(base+"/flaky",null).body.equals("recovered")&&attempts.get()==2,"Configuration GET did not retry once");
      attempts.set(0);try{SpiderHttp.request(base+"/broken",new JSONObject(),null);throw new AssertionError("Persistent failure accepted");}catch(IOException expected){}check(attempts.get()==2,"Retried more than once");
      attempts.set(0);try{SpiderHttp.request(base+"/flaky",new JSONObject().put("method","POST").put("body","data"),null);throw new AssertionError("Broken POST accepted");}catch(IOException expected){}check(attempts.get()==1,"POST was retried");
      try{SpiderHttp.request("file:///private",new JSONObject(),null);throw new AssertionError("Allowed file");}catch(IOException expected){}
      System.out.println("Native JS HTTP checks passed");
    }finally{a.stop(0);b.stop(0);}
  }
}`)
  const cp=[work,json].join(path.delimiter)
  const run=(name,args)=>{const result=spawnSync(path.join(javaBin,name),args,{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message);return result.stdout}
  run('javac.exe',['-encoding','UTF-8','--release','8','-classpath',cp,'-d',work,source,stub,...['SpiderHttp.java','HttpTransport.java'].map(name=>path.join(root,'native/tvbox/src/io/localvideo/tvbox',name))])
  assert.match(run('java.exe',['-Dfile.encoding=UTF-8','-cp',cp,'SpiderHttpCheck']),/Native JS HTTP checks passed/)
})
