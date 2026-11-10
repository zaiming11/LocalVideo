package io.localvideo.tvbox;

import android.content.Context;
import android.app.Application;
import dalvik.system.DexClassLoader;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import java.lang.reflect.*;

/** Android-only asynchronous host; never loaded by the Windows application. */
public class Bridge {
    private Context context;
    private File cache;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService networkWorker = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String,String> results = new ConcurrentHashMap<>();
    private final Map<String,ClassLoader> loaders = new HashMap<>();
    private final Map<String,Object> spiders = new HashMap<>();
    private final Map<String,ClassLoader> spiderLoaders = new HashMap<>();
    private volatile Object recentSpider;
    private volatile ClassLoader recentLoader;
    private static volatile int proxyPort;
    private ServerSocket server;
    private LocalResources localResources;
    private synchronized LocalResources localResources() { if (localResources == null) localResources = new LocalResources(context, proxyPort); return localResources; }
    public void configure(Context hostContext, String directory) throws Exception {
        // CatVod Init and Spider.init expect the process Application, not a page Activity.
        Context application = hostContext == null ? null : hostContext.getApplicationContext();
        if (!(application instanceof Application)) throw new IllegalArgumentException("Android 插件宿主未取得 Application 上下文");
        // In a packaged uni-app the host API lives in a child DEX loader. Guarded
        // plugins create another loader from the Application; expose the host API there.
        context = application.getClassLoader() == getClass().getClassLoader() ? application : new PluginApplication((Application)application, getClass().getClassLoader());
        cache = new File(directory); cache.mkdirs();
        server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        proxyPort = server.getLocalPort();
        Thread thread = new Thread(() -> {
            while (!server.isClosed()) try {
                final Socket socket = server.accept();
                Thread connection = new Thread(() -> serveProxy(socket), "TVBoxProxy");
                connection.setDaemon(true); connection.start();
            } catch (IOException ignored) {}
        }, "TVBoxProxyAccept");
        thread.setDaemon(true); thread.start();
    }
    public static String proxyUrl() { return "http://127.0.0.1:" + proxyPort + "/proxy"; }
    public String getProxyUrl() { return proxyUrl(); }
    public String playbackUrl(String url, String headers) throws Exception {
        if (url.startsWith("http://127.0.0.1:9978/proxy")) return url.replace("http://127.0.0.1:9978/proxy", proxyUrl());
        return "http://127.0.0.1:" + proxyPort + "/media?source=" + URLEncoder.encode(url, "UTF-8") + "&headers=" + URLEncoder.encode(headers, "UTF-8");
    }
    public void enqueue(final String id, final String payload) {
        enqueueOn(worker, id, payload);
    }
    public void enqueueRequest(final String id, final String payload) {
        enqueueOn(networkWorker, id, payload);
    }
    private void enqueueOn(ExecutorService executor, final String id, final String payload) {
        if (results.size() > 128) results.clear();
        executor.submit(() -> {
            ClassLoader previous = Thread.currentThread().getContextClassLoader();
            Thread.currentThread().setContextClassLoader(getClass().getClassLoader());
            try { results.put(id, new JSONObject().put("ok", true).put("body", execute(new JSONObject(payload))).toString()); }
            catch (Throwable error) {
                while (error instanceof InvocationTargetException && ((InvocationTargetException)error).getCause() != null) error = error.getCause();
                android.util.Log.e("TVBoxBridge", "Plugin request failed", error);
                try { results.put(id, new JSONObject().put("ok", false).put("error", error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage())).toString()); } catch (Exception ignored) {}
            }
            finally { Thread.currentThread().setContextClassLoader(previous); }
        });
    }
    public String poll(String id) { String value = results.remove(id); return value == null ? "" : value; }
    private Object execute(JSONObject request) throws Exception {
        if ("localImport".equals(request.optString("action"))) return localResources().add(request.getJSONObject("args").getString("uri"));
        if ("localRestore".equals(request.optString("action"))) return localResources().describe(request.getJSONObject("args").getString("id"));
        if ("request".equals(request.optString("action"))) {
            JSONObject input = request.getJSONObject("args"), supplied = input.optJSONObject("headers");
            Map<String,String> headers = new HashMap<>();
            if (supplied != null) { Iterator<String> keys = supplied.keys(); while (keys.hasNext()) { String key = keys.next(); headers.put(key, supplied.optString(key)); } }
            HttpTransport.Result response = HttpTransport.get(input.getString("url"), headers);
            return new JSONObject().put("body", response.body).put("url", response.url);
        }
        JSONObject site = request.getJSONObject("site");
        String jarSpec = site.optString("jar");
        if (jarSpec.isEmpty()) throw new IOException("配置没有提供 Spider JAR 地址");
        String key = jarSpec + "|" + site.optString("key");
        Object spider = spiders.get(key);
        if (spider == null) {
            ClassLoader loader = loaders.get(jarSpec);
            if (loader == null) {
                File jar = download(jarSpec);
                File libs = new File(cache, jar.getName() + "-libs"); libs.mkdirs();
                boolean arm64 = android.os.Build.CPU_ABI.contains("64");
                try (ZipFile zip = new ZipFile(jar)) {
                    Enumeration<? extends ZipEntry> entries = zip.entries();
                    while (entries.hasMoreElements()) {
                        ZipEntry entry = entries.nextElement();
                        if (entry.isDirectory() || !entry.getName().endsWith(".so")) continue;
                        String name = new File(entry.getName()).getName();
                        if (name.contains("-v7") && arm64 || name.contains("-v8") && !arm64) continue;
                        File target = new File(libs, name);
                        try (InputStream in = zip.getInputStream(entry); OutputStream out = new FileOutputStream(target)) { copy(in, out, 32 * 1024 * 1024); }
                        // Common CatVod native guard convention: ABI-tagged resource, standard JNI filename.
                        if (name.matches(".*-v[78]\\.so")) {
                            File mapped = new File(libs, "lib" + name.replaceAll("-v[78]\\.so$", "") + ".so");
                            try (InputStream in = new FileInputStream(target); OutputStream out = new FileOutputStream(mapped)) { copy(in, out, 32 * 1024 * 1024); }
                        }
                    }
                }
                File optimized = new File(cache, "optimized"); optimized.mkdirs();
                loader = new DexClassLoader(jar.getAbsolutePath(), optimized.getAbsolutePath(), libs.getAbsolutePath(), getClass().getClassLoader());
                try { loader.loadClass("com.github.catvod.spider.Init").getMethod("init", Context.class).invoke(null, context); }
                catch (ClassNotFoundException | NoSuchMethodException ignored) {}
                loaders.put(jarSpec, loader);
            }
            String api = site.getString("api");
            if (!api.matches("csp_[A-Za-z0-9_.$]+")) throw new IOException("当前 Android 宿主支持 csp_ JAR 站点");
            spider = loader.loadClass("com.github.catvod.spider." + api.substring(4)).newInstance();
            Object extend = site.opt("ext");
            String ext = extend == null || extend == JSONObject.NULL ? "" : extend.toString();
            spider.getClass().getMethod("init", Context.class, String.class).invoke(spider, context, ext);
            spiders.put(key, spider); spiderLoaders.put(key, loader);
        }
        recentSpider = spider; recentLoader = spiderLoaders.get(key);
        JSONObject args = request.optJSONObject("args"); if (args == null) args = new JSONObject();
        String action = request.getString("action");
        switch (action) {
            case "home": return invoke(spider, "homeContent", new Class[]{boolean.class}, true);
            case "category": return invoke(spider, "categoryContent", new Class[]{String.class, String.class, boolean.class, HashMap.class}, args.optString("id"), args.optString("page", "1"), true, new HashMap<String,String>());
            case "search": return invoke(spider, "searchContent", new Class[]{String.class, boolean.class, String.class}, args.optString("keyword"), false, args.optString("page", "1"));
            case "detail": return invoke(spider, "detailContent", new Class[]{List.class}, Collections.singletonList(args.optString("id")));
            case "play":
                ArrayList<String> flags = new ArrayList<>();
                JSONArray values = args.optJSONArray("flags"); if (values != null) for (int i=0;i<values.length();i++) flags.add(values.optString(i));
                return invoke(spider, "playerContent", new Class[]{String.class, String.class, List.class}, args.optString("flag"), args.optString("url"), flags);
            default: throw new IOException("未知插件操作");
        }
    }
    private Object invoke(Object target, String name, Class[] signature, Object... args) throws Exception {
        return target.getClass().getMethod(name, signature).invoke(target, args);
    }
    private File download(String specification) throws Exception {
        String[] parts = specification.split(";md5;");
        URL url = new URL(parts[0]);
        if (!url.getProtocol().matches("https?")) throw new IOException("插件地址必须使用 HTTP/HTTPS");
        boolean local = localResources != null && localResources.owns(parts[0]);
        String key = digest((local ? localResources.cacheIdentity(parts[0]) : parts[0]).getBytes("UTF-8"), "SHA-256");
        File file = new File(cache, key + ".jar");
        if (!local && file.exists() && (parts.length < 2 || digest(file, "MD5").equalsIgnoreCase(parts[1].trim()))) return file;
        File temp = new File(cache, key + ".download");
        HttpURLConnection connection = (HttpURLConnection)url.openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
        connection.setRequestProperty("User-Agent", "okhttp/3.12.13");
        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(temp)) { copy(in, out, 32 * 1024 * 1024); }
        finally { connection.disconnect(); }
        if (parts.length > 1 && !digest(temp, "MD5").equalsIgnoreCase(parts[1].trim())) { temp.delete(); throw new IOException("插件 MD5 校验失败"); }
        try (ZipFile zip = new ZipFile(temp)) { if (zip.getEntry("classes.dex") == null) throw new IOException("插件不包含 Android DEX"); }
        if (file.exists()) { file.setWritable(true); if (!file.delete()) throw new IOException("无法更新插件缓存"); }
        if (!temp.renameTo(file)) throw new IOException("无法保存插件缓存");
        if (!file.setReadOnly()) throw new IOException("无法设置 DEX 只读权限");
        return file;
    }
    private static long copy(InputStream in, OutputStream out, long limit) throws IOException {
        byte[] buffer = new byte[32768]; long total=0; int length;
        while ((length=in.read(buffer))!=-1) { total+=length; if(total>limit)throw new IOException("数据超过大小限制"); out.write(buffer,0,length); }
        return total;
    }
    private static String digest(byte[] data, String algorithm) throws Exception { return hex(MessageDigest.getInstance(algorithm).digest(data)); }
    private static String digest(File file, String algorithm) throws Exception {
        MessageDigest md=MessageDigest.getInstance(algorithm); byte[] bytes=new byte[32768]; int length;
        try(InputStream in=new FileInputStream(file)){while((length=in.read(bytes))!=-1)md.update(bytes,0,length);}
        return hex(md.digest());
    }
    private static String hex(byte[] bytes) { StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format("%02x",b&255));return s.toString(); }
    private void serveProxy(Socket socket) {
        try (Socket client = socket) {
            client.setSoTimeout(20000);
            BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream(), "UTF-8"));
            String first=reader.readLine(); if(first==null)return;
            String[] fields=first.split(" "); if(fields.length<2)return;
            HashMap<String,String> requestHeaders=new HashMap<>();
            String line; int count=0; while((line=reader.readLine())!=null&&!line.isEmpty()){
                if(++count>100)throw new IOException("Too many headers");
                int colon=line.indexOf(':'); if(colon>0)requestHeaders.put(line.substring(0,colon).toLowerCase(Locale.ROOT),line.substring(colon+1).trim());
            }
            URI uri=new URI(fields[1]); HashMap<String,String> params=new HashMap<>();
            if (uri.getPath().startsWith("/local/")) { localResources().serve(client, uri, requestHeaders, fields[0]); return; }
            if(uri.getRawQuery()!=null)for(String pair:uri.getRawQuery().split("&")){String[] p=pair.split("=",2);params.put(URLDecoder.decode(p[0],"UTF-8"),p.length>1?URLDecoder.decode(p[1],"UTF-8"):"");}
            if ("/media".equals(uri.getPath())) { serveRemote(client, params, requestHeaders, fields[0]); return; }
            if(requestHeaders.containsKey("range")){params.put("Range",requestHeaders.get("range"));params.put("range",requestHeaders.get("range"));}
            Object[] response=null;
            try { response=(Object[])recentLoader.loadClass("com.github.catvod.spider.Proxy").getMethod("proxy", Map.class).invoke(null,params); }
            catch(ClassNotFoundException|NoSuchMethodException ignored){if(recentSpider!=null)response=(Object[])invoke(recentSpider,"proxyLocal",new Class[]{Map.class},params);}
            if(response==null||response.length<3)throw new IOException("插件没有返回代理数据");
            int status=((Number)response[0]).intValue(); String mime=String.valueOf(response[1]);
            if(mime.contains("\r")||mime.contains("\n"))throw new IOException("Bad MIME");
            OutputStream out=client.getOutputStream();
            StringBuilder header=new StringBuilder("HTTP/1.1 "+status+" OK\r\nContent-Type: "+mime+"\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n");
            if(response.length>3 && response[3] instanceof Map)for(Object entry:((Map)response[3]).entrySet()){
                Map.Entry item=(Map.Entry)entry;String name=String.valueOf(item.getKey()),value=String.valueOf(item.getValue());
                if(!name.matches("[A-Za-z0-9-]+")||value.contains("\r")||value.contains("\n")||name.equalsIgnoreCase("transfer-encoding"))continue;
                header.append(name).append(": ").append(value).append("\r\n");
            }
            out.write(header.append("\r\n").toString().getBytes("UTF-8"));
            if(!"HEAD".equals(fields[0]))try(InputStream in=(InputStream)response[2]){copy(in,out,Long.MAX_VALUE);}
        } catch(Throwable error){android.util.Log.w("TVBoxBridge","Proxy request failed",error);}
    }
    private void serveRemote(Socket client, Map<String,String> params, Map<String,String> incoming, String method) throws Exception {
        URL url=new URL(params.get("source"));
        if(!url.getProtocol().matches("https?"))throw new IOException("Unsupported protocol");
        JSONObject headers=new JSONObject(params.containsKey("headers")?params.get("headers"):"{}");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();
        connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setRequestMethod(method);
        Iterator<String> keys=headers.keys();while(keys.hasNext()){String key=keys.next();connection.setRequestProperty(key,headers.getString(key));}
        if(incoming.containsKey("range"))connection.setRequestProperty("Range",incoming.get("range"));
        try {
            int status=connection.getResponseCode();String mime=connection.getContentType();if(mime==null)mime="application/octet-stream";
            StringBuilder head=new StringBuilder("HTTP/1.1 "+status+" OK\r\nContent-Type: "+mime+"\r\nConnection: close\r\n");
            String range=connection.getHeaderField("Content-Range");if(range!=null)head.append("Content-Range: ").append(range).append("\r\n");
            OutputStream out=client.getOutputStream();
            boolean playlist="GET".equals(method)&&status==200&&(mime.contains("mpegurl")||url.getPath().endsWith(".m3u8"));
            if(playlist){
                ByteArrayOutputStream buffer=new ByteArrayOutputStream();
                try(InputStream in=connection.getInputStream()){copy(in,buffer,8*1024*1024);}
                String[] lines=new String(buffer.toByteArray(),"UTF-8").split("\\r?\\n");StringBuilder body=new StringBuilder();
                URI base=connection.getURL().toURI();
                for(String line:lines){
                    if(line.startsWith("#")){
                        java.util.regex.Matcher matcher=java.util.regex.Pattern.compile("URI=\"([^\"]+)\"").matcher(line);StringBuffer rewritten=new StringBuffer();
                        while(matcher.find())matcher.appendReplacement(rewritten,java.util.regex.Matcher.quoteReplacement("URI=\""+playbackUrl(base.resolve(matcher.group(1)).toString(),headers.toString())+"\""));
                        matcher.appendTail(rewritten);body.append(rewritten);
                    } else if(!line.trim().isEmpty())body.append(playbackUrl(base.resolve(line.trim()).toString(),headers.toString()));
                    body.append('\n');
                }
                byte[] data=body.toString().getBytes("UTF-8");head.append("Content-Length: ").append(data.length).append("\r\n\r\n");
                out.write(head.toString().getBytes("UTF-8"));out.write(data);
            } else {
                long length=connection.getContentLength();if(length>=0)head.append("Content-Length: ").append(length).append("\r\n");
                out.write(head.append("\r\n").toString().getBytes("UTF-8"));
                if(!"HEAD".equals(method))try(InputStream in=status>=400?connection.getErrorStream():connection.getInputStream()){if(in!=null)copy(in,out,Long.MAX_VALUE);}
            }
        } finally {connection.disconnect();}
    }
}
