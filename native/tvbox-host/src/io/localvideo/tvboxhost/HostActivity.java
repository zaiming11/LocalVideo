package io.localvideo.tvboxhost;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.widget.TextView;
import android.view.WindowManager;
import io.localvideo.tvbox.Bridge;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Companion app for the desktop engine. Only listens on the emulator loopback interface. */
public class HostActivity extends Activity {
    private static Bridge bridge;
    private static ServerSocket server;
    private static volatile String token = "";
    private static final ExecutorService clients = Executors.newFixedThreadPool(4);
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        TextView view = new TextView(this);
        view.setTextSize(22); view.setPadding(32, 48, 32, 32);
        view.setText("本地影库 · 安卓引擎\n\n由 Windows 桌面程序连接。\n插件的登录或授权窗口会在这里显示。\n\n关闭引擎前请先停止在线播放。");
        setContentView(view);
        updateToken(getIntent());
        try {
            if (bridge == null) { bridge = new Bridge(); bridge.configure(this, new File(getFilesDir(), "spiders").getAbsolutePath()); }
            if (server == null) {
                server = new ServerSocket(9979, 8, InetAddress.getByName("127.0.0.1"));
                Thread accept = new Thread(() -> {
                    while (!server.isClosed()) try { final Socket socket = server.accept(); clients.submit(() -> serve(socket)); }
                    catch (Exception e) { android.util.Log.w("LocalVideoHost", "Accept failed", e); }
                }, "LocalVideoHost"); accept.setDaemon(true); accept.start();
            }
        } catch (Exception e) { view.append("\n启动失败：" + e.getMessage()); }
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); updateToken(intent); }
    private void updateToken(Intent intent) {
        String next = intent.getStringExtra("token");
        if (next != null && next.matches("[a-f0-9]{64}")) token = next;
    }
    private static String line(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); int b;
        while ((b = in.read()) != -1 && b != '\n') { if (out.size() >= 8192) throw new IOException("Header too long"); if (b != '\r') out.write(b); }
        return out.toString("UTF-8");
    }
    private static void respond(Socket socket, int status, JSONObject result) throws Exception {
        byte[] data = result.toString().getBytes("UTF-8"); OutputStream out = socket.getOutputStream();
        out.write(("HTTP/1.1 " + status + " Result\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + data.length + "\r\nConnection: close\r\n\r\n").getBytes("UTF-8")); out.write(data);
    }
    private static void serve(Socket socket) {
        try (Socket client = socket) {
            client.setSoTimeout(10000); InputStream in = client.getInputStream();
            String[] request = line(in).split(" "); if (request.length < 2) return;
            Map<String,String> headers = new HashMap<>(); String header;
            for (int count = 0; !(header = line(in)).isEmpty(); count++) {
                if (count > 50) throw new IOException("Too many headers");
                int colon = header.indexOf(':'); if (colon > 0) headers.put(header.substring(0, colon).toLowerCase(Locale.ROOT), header.substring(colon + 1).trim());
            }
            if (token.isEmpty() || !java.security.MessageDigest.isEqual(("Bearer " + token).getBytes("UTF-8"), headers.getOrDefault("authorization", "").getBytes("UTF-8"))) {
                respond(client, 403, new JSONObject().put("error", "Unauthorized")); return;
            }
            int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
            if (length < 0 || length > 1024 * 1024) throw new IOException("Request too large");
            byte[] body = new byte[length]; int offset = 0, read;
            while (offset < length && (read = in.read(body, offset, length - offset)) > 0) offset += read;
            if (offset != length) throw new IOException("Incomplete body");
            JSONObject input = length == 0 ? new JSONObject() : new JSONObject(new String(body, "UTF-8"));
            JSONObject result = new JSONObject();
            if ("/health".equals(request[1])) {
                result.put("version", 1).put("sdk", android.os.Build.VERSION.SDK_INT).put("abi", android.os.Build.CPU_ABI).put("abis", new org.json.JSONArray(android.os.Build.SUPPORTED_ABIS)).put("proxyPort", new URL(bridge.getProxyUrl()).getPort());
            } else if ("POST".equals(request[0]) && "/enqueue".equals(request[1])) {
                String id = input.getString("id"); if (!id.matches("[a-zA-Z0-9-]{1,100}")) throw new IOException("Invalid id");
                JSONObject task = input.getJSONObject("request");
                if ("request".equals(task.optString("action"))) bridge.enqueueRequest(id, task.toString());
                else bridge.enqueue(id, task.toString());
                result.put("queued", true);
            } else if ("POST".equals(request[0]) && "/poll".equals(request[1])) {
                String value = bridge.poll(input.getString("id")); result.put("result", value.isEmpty() ? JSONObject.NULL : new JSONObject(value));
            } else if ("POST".equals(request[0]) && "/media".equals(request[1])) {
                result.put("url", bridge.playbackUrl(input.getString("url"), input.optJSONObject("headers") == null ? "{}" : input.getJSONObject("headers").toString()));
            } else { respond(client, 404, result.put("error", "Unknown route")); return; }
            respond(client, 200, result);
        } catch (Throwable error) { android.util.Log.w("LocalVideoHost", "Request failed", error); }
    }
}
