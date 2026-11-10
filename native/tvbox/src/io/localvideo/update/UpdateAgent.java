package io.localvideo.update;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.*;
import java.net.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Public GitHub Release updates with verified background downloads. */
public class UpdateAgent {
    private Context context;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String,String> results = new ConcurrentHashMap<>();
    private volatile String progress = "{}";
    private File downloaded;
    private JSONObject downloadedRelease;
    private static final String ALIAS = "localvideo_update_source_v1";
    private static final String DEFAULT_URL = "https://github.com/zaiming11/LocalVideo/releases/latest/download/version.json";
    public void configure(Context activity) { context = activity.getApplicationContext(); }
    private javax.crypto.SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (javax.crypto.SecretKey)store.getKey(ALIAS, null);
    }
    private JSONObject legacyConfig() throws Exception {
        String value = context.getSharedPreferences(ALIAS, 0).getString("source", "");
        if (value.isEmpty()) return null;
        String[] parts = value.split(":", 2); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), "UTF-8"));
    }
    private JSONObject config() throws Exception {
        android.content.SharedPreferences preferences = context.getSharedPreferences(ALIAS, 0);
        String value = preferences.getString("githubSource", "");
        JSONObject saved = new JSONObject();
        if (!value.isEmpty()) { try { saved = new JSONObject(value); } catch (Exception ignored) {} }
        else { try { JSONObject old = legacyConfig(); if (old != null) saved = old; } catch (Exception ignored) {} }
        JSONObject current = normalizeConfig(saved);
        if (value.isEmpty() || preferences.contains("source")) preferences.edit().putString("githubSource", current.toString()).remove("source").apply();
        return current;
    }
    public String getConfig() throws Exception {
        JSONObject visible = config();
        visible.put("configured", true);
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        visible.put("packageName", context.getPackageName()).put("installedVersion", info.versionName).put("installedCode", info.versionCode);
        return visible.toString();
    }
    public String saveConfig(String json) throws Exception {
        JSONObject input = new JSONObject(json);
        JSONObject next = normalizeConfig(input);
        context.getSharedPreferences(ALIAS, 0).edit().putString("githubSource", next.toString()).remove("source").apply(); downloaded = null; downloadedRelease = null;
        return getConfig();
    }
    private static JSONObject normalizeConfig(JSONObject input) throws Exception {
        String mode = input.optString("downloadMode", "auto"), mirror = input.optString("mirrorUrl").trim();
        if (!Arrays.asList("auto", "direct", "custom").contains(mode)) mode = "auto";
        if (!mirror.isEmpty()) {
            URL url = new URL(mirror);
            if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null || url.getPath().contains("https:")) throw new IOException("镜像地址须为不含账号密码、参数的 HTTPS 前缀");
            mirror = url.toString().replaceAll("/+$", "") + "/";
        }
        if ("custom".equals(mode) && mirror.isEmpty()) throw new IOException("请填写镜像地址");
        return new JSONObject().put("manifestUrl", DEFAULT_URL).put("autoCheck", input.optBoolean("autoCheck", true)).put("downloadMode", mode).put("mirrorUrl", mirror);
    }
    private static List<URL> updateSources(URL target, JSONObject saved) throws Exception {
        List<URL> sources = new ArrayList<>(); String mode = saved.optString("downloadMode", "auto");
        if (!"direct".equals(mode)) sources.add(new URL(("custom".equals(mode) ? saved.getString("mirrorUrl") : "https://gh-proxy.com/") + target.toString()));
        sources.add(target); return sources;
    }
    public void enqueue(String id, String action, String payload) {
        worker.submit(() -> {
            try {
                Object body;
                if ("check".equals(action)) body = readManifest();
                else if ("download".equals(action)) body = download(new JSONObject(payload));
                else if ("installPath".equals(action)) { verifyDownloaded(); body = downloaded.getAbsolutePath(); }
                else throw new IOException("未知更新操作");
                if (results.size() > 32) results.clear(); results.put(id, new JSONObject().put("ok", true).put("body", body).toString());
            } catch (Exception error) {
                try { results.put(id, new JSONObject().put("ok", false).put("error", error.getMessage() == null ? "更新操作失败" : error.getMessage()).toString()); } catch (Exception ignored) {}
            }
        });
    }
    public String poll(String id) { String result = results.remove(id); return result == null ? "" : result; }
    public String getProgress() { return progress; }
    private HttpURLConnection connect(URL url, JSONObject saved) throws Exception {
        URL current = url;
        for (int hop = 0; hop < 6; hop++) {
            if (!"https".equals(current.getProtocol()) || current.getUserInfo() != null) throw new IOException("更新下载只允许 HTTPS");
            HttpURLConnection connection = (HttpURLConnection)current.openConnection(); connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000); connection.setReadTimeout(30000); connection.setRequestProperty("User-Agent", "LocalVideo-Updater/1"); connection.setRequestProperty("Cache-Control", "no-cache"); connection.setRequestProperty("Accept-Encoding", "identity");
            int status = connection.getResponseCode();
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = connection.getHeaderField("Location"); connection.disconnect(); if (location == null) throw new IOException("更新重定向地址缺失");
                current = new URL(current, location); continue;
            }
            if (status < 200 || status >= 300) { connection.disconnect(); throw new IOException(status == 404 ? "GitHub 尚未发布版本文件或安装包" : status == 403 || status == 429 ? "GitHub 暂时限制请求，请稍后重试" : "GitHub 更新服务器返回 HTTP " + status); }
            return connection;
        }
        throw new IOException("更新重定向次数过多");
    }
    private String readManifest() throws Exception {
        JSONObject saved = config();
        Exception last = null;
        for (URL source : updateSources(new URL(DEFAULT_URL), saved)) {
            try { return readManifestFrom(source, saved); } catch (Exception error) { last = error; }
        }
        throw last;
    }
    private String readManifestFrom(URL source, JSONObject saved) throws Exception {
        HttpURLConnection connection = connect(source, saved);
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[8192]; int length;
            while ((length = in.read(bytes)) != -1) { if (out.size() + length > 1024 * 1024) throw new IOException("版本文件过大"); out.write(bytes, 0, length); }
            String text = out.toString("UTF-8").replaceFirst("^\uFEFF", ""); JSONObject manifest = new JSONObject(text);
            if (manifest.getInt("schemaVersion") != 1 || !manifest.has("platforms")) throw new IOException("版本管理文件格式不正确");
            return text;
        } finally { connection.disconnect(); }
    }
    private String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256"); byte[] bytes = new byte[32768]; int length;
        try (InputStream in = new FileInputStream(file)) { while ((length = in.read(bytes)) != -1) digest.update(bytes, 0, length); }
        StringBuilder value = new StringBuilder(); for (byte b : digest.digest()) value.append(String.format("%02x", b & 255)); return value.toString();
    }
    private JSONObject download(JSONObject release) throws Exception {
        JSONObject saved = config(); Exception last = null;
        for (URL target : updateSources(downloadUrl(release, release.getString("file")), saved)) {
            try { return downloadFrom(release, saved, target); }
            catch (Exception error) { downloaded = null; downloadedRelease = null; progress = "{}"; last = error; }
        }
        throw last;
    }
    private JSONObject downloadFrom(JSONObject release, JSONObject saved, URL target) throws Exception {
        String name = release.getString("file"); long size = release.getLong("size"); String sha = release.getString("sha256");
        if (!name.matches("[A-Za-z0-9][A-Za-z0-9._-]*\\.apk") || name.length() > 180 || !sha.matches("[a-f0-9]{64}") || size <= 0 || size > 2147483647L) throw new IOException("安装包参数不正确");
        downloaded = null; downloadedRelease = null;
        File base = context.getExternalFilesDir(null); if (base == null) throw new IOException("应用下载缓存目录不可用");
        File directory = new File(base, "updates"); directory.mkdirs(); File file = new File(directory, name), partial = new File(directory, name + ".part");
        HttpURLConnection connection = connect(target, saved);
        long received = 0, last = 0;
        try {
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                byte[] bytes = new byte[32768]; int length;
                while ((length = in.read(bytes)) != -1) { received += length; if (received > size) throw new IOException("安装包大小不一致"); out.write(bytes, 0, length); if (System.currentTimeMillis() - last > 300) { progress = new JSONObject().put("received", received).put("total", size).toString(); last = System.currentTimeMillis(); } }
            }
            if (received != size || !hash(partial).equals(sha)) throw new IOException("安装包 SHA-256 或大小校验失败，已阻止安装");
            if (file.exists() && !file.delete() || !partial.renameTo(file)) throw new IOException("无法保存安装包");
            downloaded = file; downloadedRelease = release; verifyDownloaded();
            progress = new JSONObject().put("received", size).put("total", size).put("complete", true).toString();
            return new JSONObject().put("complete", true).put("version", release.getString("version"));
        } finally { connection.disconnect(); if (partial.exists()) partial.delete(); }
    }
    private static URL downloadUrl(JSONObject release, String name) throws Exception {
        URL target = new URL(release.optString("downloadUrl", new URL(new URL(DEFAULT_URL), name).toString()));
        if (release.has("downloadUrl")) {
            String[] segments = target.getPath().split("/", -1);
            if (!"https".equals(target.getProtocol()) || !"github.com".equals(target.getHost()) || target.getPort() != -1 && target.getPort() != 443 || target.getUserInfo() != null || target.getQuery() != null || target.getRef() != null || segments.length != 7 || !target.getPath().startsWith("/zaiming11/LocalVideo/releases/download/") || segments[5].isEmpty() || !name.equals(segments[6])) throw new IOException("安装包下载地址必须属于 LocalVideo 的 GitHub Release");
        }
        return target;
    }
    private void verifyDownloaded() throws Exception {
        if (downloaded == null || downloadedRelease == null || !downloaded.isFile() || !hash(downloaded).equals(downloadedRelease.getString("sha256"))) throw new IOException("请先下载并校验更新");
        PackageManager pm = context.getPackageManager(); PackageInfo archive = pm.getPackageArchiveInfo(downloaded.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo current = pm.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES);
        if (archive == null || !context.getPackageName().equals(archive.packageName)) throw new IOException("安装包不属于当前应用；调试基座请先安装正式 APK");
        if (archive.versionCode != downloadedRelease.getInt("versionCode") || !archive.versionName.equals(downloadedRelease.getString("version")) || archive.versionCode <= current.versionCode) throw new IOException("APK 实际版本与版本文件不一致，或不是新版本");
        boolean matching = false; if (archive.signatures != null && current.signatures != null) for (Signature a : archive.signatures) for (Signature b : current.signatures) if (a.equals(b)) matching = true;
        if (!matching) throw new IOException("APK 签名与已安装应用不一致，不能覆盖更新");
    }
}
