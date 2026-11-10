import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : 'C:/Program Files/Common Files/Oracle/Java/javapath'
test('native TVBox requests preserve User-Agent, final URL and gzip text, and strip cross-origin credentials', { skip: !fs.existsSync(path.join(javaBin, 'javac.exe')) }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-http-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'HttpCheck.java')
  fs.writeFileSync(file, `
import com.sun.net.httpserver.*;
import java.net.*; import java.io.*; import java.util.*; import java.util.zip.*;
import io.localvideo.tvbox.HttpTransport;
public class HttpCheck {
  static void respond(HttpExchange e, int status, byte[] body) throws IOException { e.sendResponseHeaders(status, body.length); try(OutputStream out=e.getResponseBody()){out.write(body);} }
  static void redirect(HttpExchange e, String url) throws IOException { e.getResponseHeaders().set("Location",url);e.sendResponseHeaders(302,-1);e.close(); }
  static void check(boolean ok, String message) { if(!ok)throw new AssertionError(message); }
  public static void main(String[] args) throws Exception {
    HttpServer a=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0), b=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    String base="http://127.0.0.1:"+a.getAddress().getPort(), other="http://127.0.0.1:"+b.getAddress().getPort();
    a.createContext("/start", e->redirect(e,"/nested/config.json"));
    a.createContext("/nested/config.json", e->{
      if(!"okhttp/3.12.13".equals(e.getRequestHeaders().getFirst("User-Agent"))){respond(e,200,"<html>browser</html>".getBytes("UTF-8"));return;}
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(GZIPOutputStream gzip=new GZIPOutputStream(bytes)){gzip.write("影视配置".getBytes("UTF-8"));}
      e.getResponseHeaders().set("Content-Encoding","gzip");e.getResponseHeaders().set("Content-Type","application/json; charset=UTF-8");respond(e,200,bytes.toByteArray());
    });
    a.createContext("/cross", e->redirect(e,other+"/sink"));
    b.createContext("/sink", e->{boolean safe=e.getRequestHeaders().getFirst("Authorization")==null&&e.getRequestHeaders().getFirst("Cookie")==null&&"fixture-agent".equals(e.getRequestHeaders().getFirst("User-Agent"));respond(e,safe?200:403,"OK".getBytes("UTF-8"));});
    a.createContext("/loop",e->redirect(e,"/loop"));
    a.createContext("/denied",e->respond(e,403,"Denied".getBytes("UTF-8")));
    a.createContext("/large",e->respond(e,200,new byte[8*1024*1024+1]));
    a.start();b.start();
    try {
      HttpTransport.Result r=HttpTransport.get(base+"/start",Collections.emptyMap());check(r.body.equals("影视配置"),"User-Agent/gzip decoding failed");check(r.url.equals(base+"/nested/config.json"),"Redirect base URL lost");
      Map<String,String> h=new HashMap<>();h.put("Authorization","fixture");h.put("Cookie","fixture");h.put("user-agent","fixture-agent");check(HttpTransport.get(base+"/cross",h).body.equals("OK"),"Credential leak or custom UA lost");
      for(String suffix:new String[]{"/loop","/denied","/large"}){try{HttpTransport.get(base+suffix,null);throw new AssertionError("Accepted "+suffix);}catch(IOException expected){}}
      try{HttpTransport.get("file:///example",null);throw new AssertionError("Accepted file protocol");}catch(IOException expected){}
      System.out.println("native HTTP checks passed");
    }finally{a.stop(0);b.stop(0);}
  }
}`)
  const run = (exe, args) => { const result = spawnSync(path.join(javaBin, exe), args, { encoding: 'utf8', timeout: 30000, windowsHide: true }); assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout); return result.stdout }
  run('javac.exe', ['-encoding', 'UTF-8', '--release', '8', '-d', dir, file, path.join(root, 'native/tvbox/src/io/localvideo/tvbox/HttpTransport.java')])
  assert.match(run('java.exe', ['-cp', dir, 'HttpCheck']), /native HTTP checks passed/)
})
