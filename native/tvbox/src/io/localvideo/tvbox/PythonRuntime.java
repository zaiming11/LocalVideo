package io.localvideo.tvbox;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** Lazily prepares verified CPython libraries; no external Python installation. */
public final class PythonRuntime {
    private final Context context;
    private final File cache;
    private final String assets,version;
    private File root;
    private long preparationDeadline;
    private static String activeRoot;
    private static boolean startupFailed;
    private static native byte[] nativeInitialize(byte[] root,byte[] abi);
    private static native byte[] nativeInvoke(byte[] payload);

    public PythonRuntime(Context context,File cache,String assets,String version){this.context=context;this.cache=cache;this.assets=assets;this.version=version;}
    private InputStream asset(String name)throws Exception{
        String path=assets+"/"+name;int index=path.indexOf("/android_asset/");
        return index>=0?context.getAssets().open(path.substring(index+15)):new FileInputStream(path);
    }
    private static byte[] read(InputStream in,long limit)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[32768];int size;
        while((size=in.read(bytes))!=-1){if(out.size()+size>limit)throw new IOException("Python 资源超过限制");out.write(bytes,0,size);}return out.toByteArray();
    }
    private static String hash(byte[] data)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(data));}
    private static String hash(File file)throws Exception{
        MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=new byte[32768];int size;
        try(InputStream in=new FileInputStream(file)){while((size=in.read(bytes))!=-1)digest.update(bytes,0,size);}return hex(digest.digest());
    }
    private static String hex(byte[] value){StringBuilder result=new StringBuilder();for(byte b:value)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
    private static File child(File parent,String name)throws IOException{
        File file=new File(parent,name).getCanonicalFile();if(!file.getPath().startsWith(parent.getCanonicalPath()+File.separator))throw new IOException("Python 资源路径越界");return file;
    }
    private void copyAsset(String name,File destination,String sha)throws Exception{
        if(destination.isFile()&&hash(destination).equals(sha))return;
        byte[] data;try(InputStream in=asset(name)){data=read(in,16*1024*1024);}
        if(!hash(data).equals(sha))throw new IOException("Python 内置资源校验失败："+name);
        destination.getParentFile().mkdirs();if(destination.exists())destination.setWritable(true);
        try(OutputStream out=new FileOutputStream(destination)){out.write(data);}destination.setReadOnly();
    }
    private File download(JSONObject spec)throws Exception{
        String sha=spec.getString("sha256");if(!sha.matches("[a-f0-9]{64}"))throw new IOException("Python 资源摘要无效");
        File artifacts=new File(cache,"python-artifacts");artifacts.mkdirs();File file=new File(artifacts,sha+".zip");
        if(file.isFile()&&hash(file).equals(sha))return file;
        String address=spec.getString("url");
        if(!address.startsWith("https://repo.maven.apache.org/maven2/com/chaquo/python/target/"))throw new IOException("Python 运行库下载地址无效");
        if(System.nanoTime()>preparationDeadline)throw new IOException("Python 运行库准备超时，请稍后重试");
        File temp=new File(artifacts,sha+".download");long total=0,limit=spec.getLong("size");
        if(limit<=0||limit>32*1024*1024)throw new IOException("Python 运行库大小无效");
        HttpURLConnection connection=(HttpURLConnection)new URL(address).openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setRequestProperty("Accept-Encoding","identity");
        try{
            if(connection.getResponseCode()!=200)throw new IOException("Python 运行库下载 HTTP "+connection.getResponseCode());
            try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(temp)){
                byte[] bytes=new byte[32768];int size;
                while((size=in.read(bytes))!=-1){total+=size;if(total>limit||System.nanoTime()>preparationDeadline)throw new IOException("Python 运行库下载超时或大小异常");out.write(bytes,0,size);}
            }
            if(total!=limit||!hash(temp).equals(sha))throw new IOException("Python 运行库完整性校验失败");
            if(file.exists()){file.setWritable(true);if(!file.delete())throw new IOException("无法更新 Python 资源缓存");}
            if(!temp.renameTo(file))throw new IOException("无法保存 Python 运行库");file.setReadOnly();return file;
        }finally{connection.disconnect();if(temp.exists())temp.delete();}
    }
    private void extract(File archive,String abi)throws Exception{
        long total=0;int count=0;
        try(ZipFile zip=new ZipFile(archive)){
            for(Enumeration<? extends ZipEntry> items=zip.entries();items.hasMoreElements();){
                ZipEntry entry=items.nextElement();String name=entry.getName();
                if(entry.isDirectory()||!(name.startsWith("jniLibs/"+abi+"/")||name.startsWith("lib-dynload/"+abi+"/")))continue;
                if(++count>256)throw new IOException("Python 原生模块数量异常");
                File destination=child(root,name);destination.getParentFile().mkdirs();if(destination.exists())destination.setWritable(true);
                try(InputStream in=zip.getInputStream(entry);OutputStream out=new FileOutputStream(destination)){
                    byte[] bytes=new byte[32768];int size;while((size=in.read(bytes))!=-1){total+=size;if(total>64*1024*1024)throw new IOException("Python 原生模块解压超限");out.write(bytes,0,size);}
                }destination.setReadOnly();
            }
        }
    }
    public void prepare()throws Exception{
        synchronized(PythonRuntime.class){
            if(android.os.Build.VERSION.SDK_INT<24)throw new IOException("Python Spider 需要 Android 7.0 或更新版本");
            String abi=android.os.Process.is64Bit()?"arm64-v8a":"armeabi-v7a";
            if(!Arrays.asList(android.os.Build.SUPPORTED_ABIS).contains(abi))throw new IOException("Python Spider 当前支持 ARM64/ARMv7 安卓设备");
            if(!version.matches("[a-f0-9]{64}"))throw new IOException("Python 运行库版本无效");
            root=new File(cache,"python-"+version.substring(0,16));root.mkdirs();
            if(activeRoot!=null){if(!activeRoot.equals(root.getAbsolutePath()))throw new IOException("Python 组件已更新，请重启 App 后使用");return;}
            if(startupFailed)throw new IOException("Python 初始化曾失败，请重启 App 后重试");
            preparationDeadline=System.nanoTime()+90000000000L;
            byte[] data;try(InputStream in=asset("runtime.json")){data=read(in,1024*1024);}
            if(!hash(data).equals(version))throw new IOException("Python 运行库清单校验失败");
            JSONObject manifest=new JSONObject(new String(data,"UTF-8")),artifacts=manifest.getJSONObject("artifacts");
            File standard=download(artifacts.getJSONObject("stdlib")),destination=new File(root,"stdlib.zip");
            if(!destination.isFile()||!hash(destination).equals(artifacts.getJSONObject("stdlib").getString("sha256"))){
                if(destination.exists())destination.setWritable(true);
                try(InputStream in=new FileInputStream(standard);OutputStream out=new FileOutputStream(destination)){byte[] bytes=new byte[32768];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}destination.setReadOnly();
            }
            File marker=new File(root,"target-"+abi+".ready");
            if(!marker.exists()){extract(download(artifacts.getJSONObject(abi.equals("arm64-v8a")?"arm64":"armv7")),abi);if(!marker.createNewFile())throw new IOException("Python 解压标记创建失败");}
            copyAsset("requirements.zip",new File(root,"requirements.zip"),manifest.getJSONObject("requirements").getString("sha256"));
            copyAsset("cacert.pem",new File(root,"cacert.pem"),manifest.getString("certificate"));
            JSONObject host=manifest.getJSONObject("host");for(Iterator<String> keys=host.keys();keys.hasNext();){String name=keys.next();copyAsset("host/"+name,child(root,"host/"+name),host.getString(name));}
            File libraries=new File(root,"jniLibs/"+abi);
            copyAsset(abi+"/liblocalvideo_python.so",new File(libraries,"liblocalvideo_python.so"),manifest.getJSONObject("jni").getJSONObject(abi).getString("sha256"));
            // Keep dependencies in this class loader's namespace before CPython
            // loads extension modules with dlopen().
            for(String name:new String[]{"crypto_python","crypto_chaquopy","ssl_python","ssl_chaquopy","sqlite3_python","sqlite3_chaquopy","python3.11","python3","localvideo_python"})System.load(new File(libraries,"lib"+name+".so").getAbsolutePath());
            String error=new String(nativeInitialize(root.getAbsolutePath().getBytes("UTF-8"),abi.getBytes("UTF-8")),"UTF-8");
            if(!error.isEmpty()){startupFailed=true;throw new IOException(error);}
            File state=new File(cache,"python-site-cache");state.mkdirs();
            JSONObject configuration=new JSONObject().put("action","configure").put("args",new JSONObject().put("cert",new File(root,"cacert.pem").getAbsolutePath()).put("cache",state.getAbsolutePath()));
            invokeRaw(configuration);activeRoot=root.getAbsolutePath();
        }
    }
    private static Object invokeRaw(JSONObject payload)throws Exception{
        byte[] value=nativeInvoke(payload.toString().getBytes("UTF-8"));String text=new String(value,"UTF-8");JSONObject response;
        try{response=new JSONObject(text);}catch(JSONException error){throw new IOException("Python 执行失败："+text);}
        if(!response.optBoolean("ok"))throw new IOException(response.optString("error","Python 执行失败"));
        return response.opt("body");
    }
    public Object execute(JSONObject payload)throws Exception{prepare();return invokeRaw(payload);}
}
