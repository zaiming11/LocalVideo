package io.localvideo.tvbox;

import android.content.Context;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.*;
import java.util.*;
import java.util.regex.Pattern;

/** Read-only SAF folder resources. Only registered trees and this process's URL token are accepted. */
public final class LocalResources {
    private final Context context;
    private final ContentResolver resolver;
    private final String token, base;
    private static final String PREFS = "localvideo_tvbox_folders_v1";
    private static final Pattern CONFIG = Pattern.compile("(?:^|[,{])\\s*[\"']?(?:sites|urls|lives)[\"']?\\s*:", Pattern.MULTILINE);
    private static final long MAX_TEXT = 8 * 1024 * 1024;
    public LocalResources(Context context, int port) {
        this.context = context; resolver = context.getContentResolver();
        byte[] random = new byte[16]; new SecureRandom().nextBytes(random);
        token = hex(random); base = "http://127.0.0.1:" + port + "/local/" + token + "/";
    }
    private static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format("%02x", b & 255)); return out.toString(); }
    private static final class Document {
        String id, name, mime; long size;
        boolean directory() { return DocumentsContract.Document.MIME_TYPE_DIR.equals(mime); }
    }
    private List<Document> query(Uri uri) throws Exception {
        List<Document> result = new ArrayList<>();
        String[] columns = { "document_id", "_display_name", "mime_type", "_size" };
        try (Cursor cursor = resolver.query(uri, columns, null, null, null)) {
            if (cursor == null) throw new IOException("无法读取文件夹，请重新选择并授予读取权限");
            while (cursor.moveToNext()) {
                Document document = new Document();
                document.id = cursor.getString(0); document.name = cursor.getString(1); document.mime = cursor.getString(2); document.size = cursor.isNull(3) ? -1 : cursor.getLong(3);
                result.add(document);
            }
        }
        return result;
    }
    private Uri documentUri(Uri tree, String id) { return DocumentsContract.buildDocumentUriUsingTree(tree, id); }
    private List<Document> children(Uri tree, String id) throws Exception { return query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)); }
    private Uri tree(String id) throws Exception {
        if (!id.matches("[a-f0-9]{32}")) throw new IOException("本地文件夹标识无效");
        String saved = context.getSharedPreferences(PREFS, 0).getString(id, "");
        if (saved.isEmpty()) throw new IOException("请重新选择本地配置文件夹");
        Uri uri = Uri.parse(saved);
        if (!"content".equals(uri.getScheme()) || !DocumentsContract.isTreeUri(uri)) throw new IOException("本地目录记录无效");
        return uri;
    }
    public JSONObject add(String address) throws Exception {
        Uri uri = Uri.parse(address);
        if (!"content".equals(uri.getScheme()) || !DocumentsContract.isTreeUri(uri)) throw new IOException("请选择配置所在文件夹");
        // Query before remembering: access is granted by the system folder picker.
        query(documentUri(uri, DocumentsContract.getTreeDocumentId(uri)));
        String id = hex(MessageDigest.getInstance("SHA-256").digest(address.getBytes("UTF-8"))).substring(0, 32);
        context.getSharedPreferences(PREFS, 0).edit().putString(id, address).apply();
        return describe(id);
    }
    public JSONObject describe(String id) throws Exception {
        Uri tree = tree(id); String root = DocumentsContract.getTreeDocumentId(tree);
        List<Document> roots = query(documentUri(tree, root));
        if (roots.isEmpty() || !roots.get(0).directory()) throw new IOException("文件夹已不可用，请重新选择");
        JSONArray candidates = new JSONArray(); long[] limits = { 0, 0 };
        scan(tree, root, "", 0, candidates, limits);
        if (candidates.length() == 0) throw new IOException("目录中没有找到包含 sites、urls 或 lives 的 JSON/TXT 主配置");
        return new JSONObject().put("id", id).put("name", roots.get(0).name).put("baseUrl", base + id + "/").put("candidates", candidates);
    }
    private void scan(Uri tree, String parent, String prefix, int depth, JSONArray found, long[] limits) throws Exception {
        for (Document child : children(tree, parent)) {
            if (++limits[0] > 4000) throw new IOException("文件夹内容过多，请选择更具体的配置目录");
            if (child.name == null || child.name.startsWith(".") || child.name.contains("/") || child.name.contains("\\")) continue;
            String path = prefix + child.name;
            if (child.directory()) { if (depth < 3) scan(tree, child.id, path + "/", depth + 1, found, limits); continue; }
            if (!child.name.toLowerCase(Locale.ROOT).matches(".*\\.(json5?|txt|conf)") || child.size > MAX_TEXT) continue;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = resolver.openInputStream(documentUri(tree, child.id))) {
                if (in == null) continue;
                copy(in, out, MAX_TEXT, false);
            }
            if (!CONFIG.matcher(out.toString("UTF-8")).find()) continue;
            limits[1] += out.size();
            if (found.length() >= 64 || limits[1] > 32 * 1024 * 1024) throw new IOException("主配置过多或过大，请选择更具体的文件夹");
            found.put(new JSONObject().put("path", path));
        }
    }
    public boolean owns(String address) { return address.startsWith(base); }
    public String cacheIdentity(String address) { return "local-folder:" + address.substring(base.length()); }
    private Document resolve(Uri tree, String[] parts) throws Exception {
        String parent = DocumentsContract.getTreeDocumentId(tree); Document result = null;
        for (int i = 0; i < parts.length; i++) {
            result = null;
            for (Document candidate : children(tree, parent)) if (parts[i].equals(candidate.name)) { result = candidate; break; }
            if (result == null || i < parts.length - 1 && !result.directory()) throw new FileNotFoundException();
            parent = result.id;
        }
        if (result == null || result.directory()) throw new FileNotFoundException();
        return result;
    }
    private static void status(OutputStream out, int status) throws IOException { out.write(("HTTP/1.1 " + status + " Result\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes("UTF-8")); }
    private static long copy(InputStream in, OutputStream out, long limit, boolean range) throws IOException {
        byte[] bytes = new byte[32768]; long total = 0; int count;
        while ((count = in.read(bytes, 0, (int)Math.min(bytes.length, range ? limit - total : bytes.length))) > 0) {
            total += count; if (total > limit) throw new IOException("配置文件超过 8 MB 限制"); out.write(bytes, 0, count);
            if (range && total == limit) break;
        }
        return total;
    }
    public void serve(Socket socket, URI address, Map<String,String> headers, String method) throws Exception {
        OutputStream out = socket.getOutputStream();
        if (!method.equals("GET") && !method.equals("HEAD")) { status(out, 405); return; }
        String[] route = address.getRawPath().split("/", 5);
        if (route.length != 5 || !MessageDigest.isEqual(route[2].getBytes("UTF-8"), token.getBytes("UTF-8"))) { status(out, 403); return; }
        String[] parts = route[4].split("/", -1);
        if (parts.length > 64) { status(out, 400); return; }
        for (int i = 0; i < parts.length; i++) {
            parts[i] = URLDecoder.decode(parts[i].replace("+", "%2B"), "UTF-8");
            if (parts[i].isEmpty() || parts[i].equals(".") || parts[i].equals("..") || parts[i].contains("/") || parts[i].contains("\\") || parts[i].indexOf(0) >= 0) { status(out, 400); return; }
        }
        Uri tree; Document document;
        try { tree = tree(route[3]); document = resolve(tree, parts); } catch (Exception error) { status(out, 404); return; }
        long start = 0, end = document.size - 1; boolean partial = headers.containsKey("range");
        if (partial) {
            try {
                String range = headers.get("range");
                if (document.size <= 0 || !range.matches("bytes=[0-9]*-[0-9]*")) throw new IOException();
                String[] positions = range.substring(6).split("-", -1);
                if (positions[0].isEmpty()) { long suffix = Long.parseLong(positions[1]); if (suffix <= 0) throw new IOException(); start = Math.max(0, document.size - suffix); }
                else { start = Long.parseLong(positions[0]); if (!positions[1].isEmpty()) end = Math.min(end, Long.parseLong(positions[1])); }
                if (start >= document.size || end < start) throw new IOException();
            } catch (Exception error) { status(out, 416); return; }
        }
        String name = document.name.toLowerCase(Locale.ROOT), mime = document.mime;
        if (name.matches(".*\\.(json5?|txt|conf)")) mime = "text/plain; charset=utf-8";
        else if (name.endsWith(".js")) mime = "application/javascript; charset=utf-8";
        else if (name.endsWith(".jar")) mime = "application/octet-stream";
        if (mime == null || mime.contains("\r") || mime.contains("\n")) mime = "application/octet-stream";
        StringBuilder response = new StringBuilder("HTTP/1.1 " + (partial ? "206 Partial Content" : "200 OK") + "\r\nContent-Type: " + mime + "\r\nConnection: close\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nAccept-Ranges: bytes\r\n");
        if (document.size >= 0) response.append("Content-Length: ").append(end - start + 1).append("\r\n");
        if (partial) response.append("Content-Range: bytes ").append(start).append("-").append(end).append("/").append(document.size).append("\r\n");
        if (method.equals("HEAD")) { out.write(response.append("\r\n").toString().getBytes("UTF-8")); return; }
        try (InputStream in = resolver.openInputStream(documentUri(tree, document.id))) {
            if (in == null) { status(out, 404); return; }
            long skip = start; while (skip > 0) { long count = in.skip(skip); if (count <= 0) { if (in.read() == -1) throw new EOFException(); count = 1; } skip -= count; }
            out.write(response.append("\r\n").toString().getBytes("UTF-8"));
            copy(in, out, document.size >= 0 ? end - start + 1 : Long.MAX_VALUE, true);
        }
    }
}
