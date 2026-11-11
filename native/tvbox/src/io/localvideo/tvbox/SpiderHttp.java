package io.localvideo.tvbox;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.Charset;
import java.util.*;
import java.util.zip.GZIPInputStream;

/** Synchronous req() for spider scripts; runs on WebView's bridge thread. */
public final class SpiderHttp {
    public static JSONObject request(String address, JSONObject options, Map<String,String> defaults) throws Exception {
        long started=System.nanoTime();
        try{return requestOnce(address,options,defaults);}
        catch(IOException error){
            if(!options.optString("method","GET").equalsIgnoreCase("GET")||!HttpTransport.retryable(error)||System.nanoTime()-started>8000000000L)throw error;
            try{Thread.sleep(250);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw error;}
            return requestOnce(address,options,defaults);
        }
    }
    private static JSONObject requestOnce(String address, JSONObject options, Map<String,String> defaults) throws Exception {
        URL current = new URL(address);
        Map<String,String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        headers.put("User-Agent", "okhttp/3.12.13"); headers.put("Accept-Encoding", "gzip");
        if (defaults != null) headers.putAll(defaults);
        JSONObject supplied = options.optJSONObject("headers");
        if (supplied != null) for (Iterator<String> keys=supplied.keys();keys.hasNext();) { String key=keys.next(); headers.put(key,supplied.optString(key)); }
        String method=options.optString("method","GET").toUpperCase(Locale.ROOT);
        if (!Arrays.asList("GET","POST","PUT","PATCH","DELETE","HEAD").contains(method)) throw new IOException("不支持的请求方法");
        Object data=options.has("body")?options.opt("body"):options.opt("data");
        String body=data==null||data==JSONObject.NULL?"":data.toString();
        if (data instanceof JSONObject && !"json".equalsIgnoreCase(options.optString("postType"))) {
            StringBuilder encoded=new StringBuilder();JSONObject values=(JSONObject)data;
            for(Iterator<String> keys=values.keys();keys.hasNext();){String key=keys.next();if(encoded.length()>0)encoded.append('&');encoded.append(URLEncoder.encode(key,"UTF-8")).append('=').append(URLEncoder.encode(values.optString(key),"UTF-8"));}
            body=encoded.toString();
        }
        if (!body.isEmpty()&&!headers.containsKey("Content-Type")) headers.put("Content-Type","json".equalsIgnoreCase(options.optString("postType"))?"application/json":"application/x-www-form-urlencoded");
        byte[] upload=body.getBytes("UTF-8");if(upload.length>1024*1024)throw new IOException("JS 请求正文超过 1 MB");
        for(int hop=0;hop<6;hop++){
            if(!current.getProtocol().matches("https?")||current.getUserInfo()!=null)throw new IOException("JS 请求仅支持无账号密码的 HTTP/HTTPS 地址");
            HttpURLConnection connection=(HttpURLConnection)current.openConnection();
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(Math.max(1000,Math.min(15000,options.optInt("timeout",15000))));connection.setReadTimeout(Math.max(1000,Math.min(20000,options.optInt("timeout",20000))));connection.setRequestMethod(method);
            try {
                for(Map.Entry<String,String> header:headers.entrySet())if(header.getKey().matches("[A-Za-z0-9-]+")&&!header.getValue().contains("\r")&&!header.getValue().contains("\n")&&!header.getKey().equalsIgnoreCase("Host")&&!header.getKey().equalsIgnoreCase("Content-Length"))connection.setRequestProperty(header.getKey(),header.getValue());
                if(!method.equals("GET")&&!method.equals("HEAD")&&upload.length>0){connection.setDoOutput(true);try(OutputStream out=connection.getOutputStream()){out.write(upload);}}
                int code=connection.getResponseCode();
                if(Arrays.asList(301,302,303,307,308).contains(code)&&options.optInt("redirect",1)!=0){
                    String location=connection.getHeaderField("Location");if(location==null)throw new IOException("JS 请求重定向缺少地址");
                    URL next=new URL(current,location);
                    if(!current.getProtocol().equalsIgnoreCase(next.getProtocol())||!current.getHost().equalsIgnoreCase(next.getHost())||current.getPort()!=next.getPort()){headers.remove("Authorization");headers.remove("Cookie");}
                    if(code==303||((code==301||code==302)&&method.equals("POST"))){method="GET";upload=new byte[0];headers.remove("Content-Type");}
                    current=next;continue;
                }
                JSONObject responseHeaders=new JSONObject();
                for(Map.Entry<String,List<String>> entry:connection.getHeaderFields().entrySet())if(entry.getKey()!=null&&entry.getValue()!=null){StringBuilder values=new StringBuilder();for(String value:entry.getValue()){if(values.length()>0)values.append(", ");values.append(value);}responseHeaders.put(entry.getKey(),values.toString()).put(entry.getKey().toLowerCase(Locale.ROOT),values.toString());}
                String charset=options.optString("encoding","UTF-8"),type=connection.getContentType();
                if(type!=null&&!options.has("encoding")){java.util.regex.Matcher match=java.util.regex.Pattern.compile("charset\\s*=\\s*[\"']?([^;\\s\"']+)",2).matcher(type);if(match.find())charset=match.group(1);}
                if(!Charset.isSupported(charset))throw new IOException("不支持字符编码："+charset);
                ByteArrayOutputStream buffer=new ByteArrayOutputStream();InputStream raw=code>=400?connection.getErrorStream():connection.getInputStream();
                if(raw!=null)try(InputStream in="gzip".equalsIgnoreCase(connection.getContentEncoding())?new GZIPInputStream(raw):raw){byte[] bytes=new byte[32768];int size;while((size=in.read(bytes))!=-1){if(buffer.size()+size>8*1024*1024)throw new IOException("JS 响应超过 8 MB");buffer.write(bytes,0,size);}}
                String content=options.optInt("buffer",0)>0?android.util.Base64.encodeToString(buffer.toByteArray(),android.util.Base64.NO_WRAP):buffer.toString(charset);
                return new JSONObject().put("code",code).put("content",content).put("headers",responseHeaders).put("url",current.toString());
            } finally {connection.disconnect();}
        }
        throw new IOException("JS 请求重定向次数过多");
    }
}
