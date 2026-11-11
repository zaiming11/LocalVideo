package io.localvideo.tvbox;

import java.io.*;
import java.net.*;
import java.nio.charset.Charset;
import java.util.*;
import java.util.zip.GZIPInputStream;

/** Native configuration/API requests preserve the source's User-Agent and final URL. */
public final class HttpTransport {
    public static final class Result {
        public final String body, url;
        Result(String body, String url) { this.body = body; this.url = url; }
    }
    private static boolean sameOrigin(URL a, URL b) {
        return a.getProtocol().equalsIgnoreCase(b.getProtocol()) && a.getHost().equalsIgnoreCase(b.getHost())
            && (a.getPort() == -1 ? a.getDefaultPort() : a.getPort()) == (b.getPort() == -1 ? b.getDefaultPort() : b.getPort());
    }
    public static Result get(String address, Map<String,String> suppliedHeaders) throws Exception {
        long started=System.nanoTime();
        try{return getOnce(address,suppliedHeaders);}
        catch(IOException error){
            if(!retryable(error)||System.nanoTime()-started>8000000000L)throw error;
            try{Thread.sleep(250);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw error;}
            return getOnce(address,suppliedHeaders);
        }
    }
    static boolean retryable(IOException error){
        String message=String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
        return error instanceof EOFException||error instanceof SocketException&&(message.contains("reset")||message.contains("abort")||message.contains("broken pipe"));
    }
    private static Result getOnce(String address, Map<String,String> suppliedHeaders) throws Exception {
        URL current = new URL(address);
        Map<String,String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        headers.put("User-Agent", "okhttp/3.12.13"); headers.put("Accept-Encoding", "gzip");
        if (suppliedHeaders != null) headers.putAll(suppliedHeaders);
        for (int hop = 0; hop < 6; hop++) {
            if (!current.getProtocol().matches("https?") || current.getUserInfo() != null) throw new IOException("接口地址必须是不含账号密码的 HTTP/HTTPS 地址");
            HttpURLConnection connection = (HttpURLConnection)current.openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
            try {
                for (Map.Entry<String,String> header : headers.entrySet()) {
                    String name = header.getKey(), value = header.getValue();
                    if (name.matches("[A-Za-z0-9-]+") && value != null && !value.contains("\r") && !value.contains("\n") && !name.equalsIgnoreCase("Host") && !name.equalsIgnoreCase("Content-Length")) connection.setRequestProperty(name, value);
                }
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location"); if (location == null) throw new IOException("接口重定向地址缺失");
                    URL next = new URL(current, location);
                    if (!sameOrigin(current, next)) { headers.remove("Authorization"); headers.remove("Cookie"); }
                    current = next; continue;
                }
                if (status < 200 || status >= 300) throw new IOException("接口返回 HTTP " + status);
                String charset = "UTF-8", type = connection.getContentType();
                if (type != null) {
                    java.util.regex.Matcher match = java.util.regex.Pattern.compile("charset\\s*=\\s*[\"']?([^;\\s\"']+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(type);
                    if (match.find() && Charset.isSupported(match.group(1))) charset = match.group(1);
                }
                try (InputStream raw = connection.getInputStream(); InputStream in = "gzip".equalsIgnoreCase(connection.getContentEncoding()) ? new GZIPInputStream(raw) : raw; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] bytes = new byte[32768]; int size;
                    while ((size = in.read(bytes)) != -1) { if (out.size() + size > 8 * 1024 * 1024) throw new IOException("配置或接口数据超过 8 MB 限制"); out.write(bytes, 0, size); }
                    return new Result(out.toString(charset), current.toString());
                }
            } finally { connection.disconnect(); }
        }
        throw new IOException("接口重定向次数过多");
    }
}
