package io.localvideo.tvbox;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** ES modules and drpy execute outside the visible uni-app WebView. */
public final class JsSpider {
    private final Context context;
    private final String assets, id, origin, api;
    private final JSONObject site;
    private final Map<String,String> headers=new HashMap<>();
    private final Handler main=new Handler(Looper.getMainLooper());
    private static final class Reply extends FutureTask<String> {
        Reply(){super(()->"");}
        void complete(String value){set(value);}
        void completeExceptionally(Throwable error){setException(error);}
    }
    private final ConcurrentHashMap<String,Reply> pending=new ConcurrentHashMap<>();
    private final Map<String,String> modules=new HashMap<>();
    private WebView view;
    private volatile boolean closed;
    private int serial, moduleBytes;

    public JsSpider(Context context, String assets, String id, JSONObject site) throws Exception {
        this.context=context;this.assets=assets;this.id=id;this.site=site;
        this.origin=Bridge.proxyUrl().replace("/proxy", "/js/"+id+"/");
        JSONObject supplied=site.optJSONObject("headers");
        if(supplied!=null)for(Iterator<String> keys=supplied.keys();keys.hasNext();){String key=keys.next();headers.put(key,supplied.optString(key));}
        HttpTransport.Result source=HttpTransport.get(site.getString("api"),headers);
        this.api=source.url;modules.put(api,source.body);moduleBytes=source.body.length();
    }
    public boolean isClosed(){return closed;}
    public synchronized String execute(String action, JSONObject args) throws Exception {
        if(closed)throw new IOException("JS Spider 已关闭，请重新选择站点");
        if(Looper.myLooper()==Looper.getMainLooper())throw new IOException("JS Spider 不能阻塞主线程");
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(50);
        if(view==null){
            Reply ready=new Reply();pending.put("ready",ready);
            main.post(()->{try{createView();}catch(Throwable error){ready.completeExceptionally(error);}});
            try{await(ready,deadline);}catch(Exception error){close();throw error;}
        }
        String ticket="call-"+(++serial);
        Reply result=new Reply();pending.put(ticket,result);
        String script="globalThis.__localvideoInvoke("+JSONObject.quote(ticket)+","+JSONObject.quote(action)+","+args.toString()+");";
        main.post(()->{if(view!=null&&!closed)view.evaluateJavascript(script,null);else result.completeExceptionally(new IOException("JS Spider 已关闭"));});
        try{return await(result,deadline);}finally{pending.remove(ticket);}
    }
    private String await(Reply result,long deadline) throws Exception {
        try{return result.get(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);}
        catch(TimeoutException error){close();throw new IOException("JS Spider 执行超时，已释放执行器");}
        catch(ExecutionException error){Throwable cause=error.getCause();throw new IOException(cause==null?error.getMessage():cause.getMessage(),cause);}
    }
    private void createView() throws Exception {
        if(closed)return;
        view=new WebView(context);
        WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setBlockNetworkLoads(true);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        view.addJavascriptInterface(new Host(),"LocalVideoSpider");
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView ignored,WebResourceRequest request){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView ignored,WebResourceRequest request){
                // loadDataWithBaseURL emits a main-frame data: request on real
                // Android WebViews. Let WebView load its own bootstrap document;
                // only HTTP(S) module fetches belong to the native downloader.
                String scheme=request.getUrl().getScheme();
                if(request.isForMainFrame()||!("http".equalsIgnoreCase(scheme)||"https".equalsIgnoreCase(scheme)))return null;
                return resource(request.getUrl().toString());
            }
        });
        JSONObject config=new JSONObject().put("api",api).put("ext",site.has("ext")?site.opt("ext"):"").put("proxy",Bridge.proxyUrl()+"?do=js&js="+id);
        JSONObject mappings=new JSONObject().put("assets://js/lib/cheerio.min.js",origin+"assets/cheerio.js").put("assets://js/lib/crypto-js.js",origin+"assets/crypto-js.js");
        String data=config.toString().replace("<","\\u003c"),imports=new JSONObject().put("imports",mappings).toString();
        String html="<!doctype html><meta charset=utf-8><meta http-equiv=Content-Security-Policy content=\"default-src 'none'; script-src http: https: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'\"><script>if(!HTMLScriptElement.supports||!HTMLScriptElement.supports('importmap'))LocalVideoSpider.complete('ready','null','Android System WebView 版本过旧，请更新后使用 JS Spider');</script><script type=importmap>"+imports+"</script><script type=module>import {start} from './assets/runtime.js'; start("+data+").catch(e=>LocalVideoSpider.complete('ready','null',String(e)));</script>";
        view.loadDataWithBaseURL(origin,html,"text/html","UTF-8",null);
    }
    private WebResourceResponse resource(String address){
        try {
            String body;
            if(address.startsWith(origin+"assets/")){
                String name=address.substring((origin+"assets/").length());
                if(!Arrays.asList("libraries.js","runtime.js","cheerio.js","crypto-js.js").contains(name))throw new IOException("未知 JS 内置依赖");
                try(InputStream in=asset(name)){body=read(in);}
            }else{
                synchronized(modules){
                    body=modules.get(address);
                    if(body==null){
                        if(modules.size()>=64)throw new IOException("JS 模块数量超过限制");
                        HttpTransport.Result response=HttpTransport.get(address,headers);body=response.body;
                        if(moduleBytes+body.length()>16*1024*1024)throw new IOException("JS 模块总大小超过限制");
                        modules.put(address,body);moduleBytes+=body.length();
                    }
                }
            }
            Map<String,String> responseHeaders=new HashMap<>();responseHeaders.put("Access-Control-Allow-Origin","*");responseHeaders.put("Cache-Control","no-store");
            return new WebResourceResponse("application/javascript","UTF-8",200,"OK",responseHeaders,new ByteArrayInputStream(body.getBytes("UTF-8")));
        }catch(Exception error){
            fail("JS 模块加载失败："+error.getMessage());
            return new WebResourceResponse("text/plain","UTF-8",502,"Module load failed",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
        }
    }
    private InputStream asset(String name) throws Exception {
        String path=assets+"/"+name;int index=path.indexOf("/android_asset/");
        return index>=0?context.getAssets().open(path.substring(index+15)):new FileInputStream(path);
    }
    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[32768];int size;
        while((size=in.read(bytes))!=-1){if(out.size()+size>8*1024*1024)throw new IOException("JS 资源超过 8 MB");out.write(bytes,0,size);}return out.toString("UTF-8");
    }
    private void fail(String message){for(Reply result:pending.values())result.completeExceptionally(new IOException(message));}
    public void close(){closed=true;fail("JS Spider 已释放");main.post(()->{if(view!=null){view.stopLoading();view.removeJavascriptInterface("LocalVideoSpider");view.destroy();view=null;}});}
    public final class Host {
        @JavascriptInterface public String request(String url,String options){
            try{return SpiderHttp.request(url,new JSONObject(options),headers).toString();}
            catch(Exception error){try{return new JSONObject().put("error",String.valueOf(error.getMessage())).toString();}catch(Exception ignored){return "{\"error\":\"JS request failed\"}";}}
        }
        @JavascriptInterface public String storage(String action,String namespace,String key,String value){
            if(namespace.length()+key.length()>4096||value.length()>1024*1024)throw new IllegalArgumentException("JS 存储数据过大");
            android.content.SharedPreferences preferences=context.getSharedPreferences("localvideo-js-"+id,0);
            String name=namespace+"\u0000"+key;
            if("set".equals(action))preferences.edit().putString(name,value).apply();
            else if("delete".equals(action))preferences.edit().remove(name).apply();
            return preferences.getString(name,"");
        }
        @JavascriptInterface public void complete(String ticket,String value,String error){
            Reply result=pending.remove(ticket);if(result==null)return;
            if(error!=null&&!error.isEmpty())result.completeExceptionally(new IOException(error));
            else if(value.length()>8*1024*1024)result.completeExceptionally(new IOException("JS Spider 返回数据超过 8 MB"));
            else result.complete(value);
        }
    }
}
