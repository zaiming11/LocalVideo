package io.localvideo.player;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.SeekBar;
import org.json.JSONObject;
import org.json.JSONArray;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** In-process player. No Activity replacement and no video copies. */
public final class VlcPlayer {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService disposal = Executors.newSingleThreadExecutor();
    private Activity activity;
    private LibVLC vlc;
    private MediaPlayer player;
    private ParcelFileDescriptor descriptor;
    private FrameLayout root;
    private TextureView video;
    private LinearLayout controls;
    private TextView play, rewind, forward, feedback;
    private SeekBar seek;
    private TextView time;
    private WebView web;
    private final java.util.ArrayList<JSONObject> events = new java.util.ArrayList<>();
    private volatile long position, duration;
    private volatile boolean playing, released;
    private volatile int generation;
    private boolean dragging, locked, metadata, fill, fullscreen, live, controlsRequested;
    private boolean normalTouching, normalMoved, normalSeeking;
    private float normalStartX, normalStartY;
    private long normalStartTime, normalTarget;
    private final Runnable hideControls = () -> { if (!fullscreen && !dragging && !normalTouching && controls != null) controls.setVisibility(View.GONE); };
    private final Runnable hideFeedback = () -> { if (feedback != null) feedback.setVisibility(View.GONE); };
    private int videoWidth, videoHeight, sarNum = 1, sarDen = 1;

    public VlcPlayer() {}
    public void init(Activity value) { activity = value; }
    private void emit(String type, String message) {
        try {
            JSONObject event = new JSONObject().put("type", type).put("generation", generation);
            if (message != null) event.put("errMsg", message);
            synchronized (events) { if (events.size() < 32) events.add(event); }
        } catch (Exception ignored) {}
    }
    private WebView findWeb(View view) {
        if (view instanceof WebView && view.isShown()) {
            WebView found = (WebView) view;
            String url = found.getUrl(), title = found.getTitle();
            if ((url != null && url.contains("pages/player/player")) || (title != null && title.contains("pages/player/player"))) return found;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = group.getChildCount() - 1; i >= 0; i--) {
                WebView found = findWeb(group.getChildAt(i));
                if (found != null) {
                    String url = found.getUrl(), title = found.getTitle();
                    if ((url != null && url.contains("pages/player/player")) || (title != null && title.contains("pages/player/player"))) return found;
                }
            }
        }
        return null;
    }
    private void attach() {
        if (root != null) return;
        web = findWeb(activity.getWindow().getDecorView());
        if (web == null) throw new IllegalStateException("无法定位播放页面");
        View anchor = web;
        while (!(anchor.getParent() instanceof FrameLayout) && anchor.getParent() instanceof View) anchor = (View)anchor.getParent();
        if (!(anchor.getParent() instanceof FrameLayout)) throw new IllegalStateException("无法定位播放页面容器");
        FrameLayout parent = (FrameLayout) anchor.getParent();
        if (vlc == null) vlc = new LibVLC(activity.getApplicationContext(), new java.util.ArrayList<>(Arrays.asList("--no-video-title-show", "--no-stats", "--audio-time-stretch", "--avcodec-skiploopfilter=1")));
        root = new FrameLayout(activity);
        root.setBackgroundColor(Color.BLACK);
        video = new TextureView(activity);
        root.addView(video, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        controls = new LinearLayout(activity);
        controls.setVisibility(View.GONE);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(12),dp(4),dp(12),dp(4));
        controls.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0x100A0D0A,0xEE0A0D0A}));
        LinearLayout row = new LinearLayout(activity); row.setGravity(Gravity.CENTER_VERTICAL);
        controls.addView(row,new LinearLayout.LayoutParams(-1,dp(28)));
        play = controlButton("▶", 0xFFE8FF63, 0xFF0A0D0A); play.setTextSize(13);
        row.addView(play,new LinearLayout.LayoutParams(dp(28),dp(28)));
        time = new TextView(activity); time.setTextColor(0xFFF5F7F2); time.setTextSize(11); time.setGravity(Gravity.CENTER_VERTICAL); time.setSingleLine(true); time.setTypeface(Typeface.MONOSPACE);
        LinearLayout.LayoutParams clockParams = new LinearLayout.LayoutParams(0,-1,1); clockParams.leftMargin = dp(10);
        row.addView(time,clockParams);
        rewind = controlButton("−10s",0x35FFFFFF,Color.WHITE); forward = controlButton("+10s",0x35FFFFFF,Color.WHITE);
        row.addView(rewind,new LinearLayout.LayoutParams(dp(40),dp(26)));
        LinearLayout.LayoutParams forwardParams = new LinearLayout.LayoutParams(dp(40),dp(26)); forwardParams.leftMargin = dp(6); row.addView(forward,forwardParams);
        seek = new SeekBar(activity); seek.setMax(10000);
        ColorStateList accent = new ColorStateList(new int[][]{new int[]{android.R.attr.state_enabled},new int[]{}},new int[]{0xFFE8FF63,0x88E8FF63});
        seek.setProgressTintList(accent); seek.setProgressBackgroundTintList(ColorStateList.valueOf(0x44FFFFFF)); seek.setThumbTintList(accent); seek.setSplitTrack(false); seek.setPadding(dp(2),0,dp(2),0);
        GradientDrawable thumb = new GradientDrawable(); thumb.setShape(GradientDrawable.OVAL); thumb.setColor(0xFFE8FF63); thumb.setSize(dp(10),dp(10)); seek.setThumb(thumb); seek.setThumbOffset(dp(5));
        controls.addView(seek, new LinearLayout.LayoutParams(-1, dp(20)));
        FrameLayout.LayoutParams bar = new FrameLayout.LayoutParams(-1, dp(56), Gravity.BOTTOM);
        root.addView(controls, bar);
        feedback = new TextView(activity); feedback.setTextColor(Color.WHITE); feedback.setTextSize(14); feedback.setGravity(Gravity.CENTER); feedback.setPadding(dp(14),dp(9),dp(14),dp(9)); feedback.setBackground(round(0xBB0A0D0A,10)); feedback.setVisibility(View.GONE);
        root.addView(feedback,new FrameLayout.LayoutParams(-2,-2,Gravity.CENTER));
        parent.addView(root, parent.indexOfChild(anchor) + 1, new FrameLayout.LayoutParams(1, 1));
        play.setOnClickListener(v -> { if (!locked && player != null) { if (playing) player.pause(); else player.play(); revealControls(); } });
        rewind.setOnClickListener(v -> step(-10000)); forward.setOnClickListener(v -> step(10000));
        video.setOnTouchListener(this::normalTouch); root.setOnTouchListener(this::normalTouch);
        controls.setOnTouchListener((v,event) -> { if (!fullscreen) { if (event.getActionMasked()==MotionEvent.ACTION_DOWN) ui.removeCallbacks(hideControls); if (event.getActionMasked()==MotionEvent.ACTION_UP || event.getActionMasked()==MotionEvent.ACTION_CANCEL) scheduleHide(); } return true; });
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar bar) { dragging = true; ui.removeCallbacks(hideControls); }
            public void onProgressChanged(SeekBar bar, int value, boolean user) { if (user && !locked && !live) time.setText(clock(duration * value / 10000) + " / " + clock(duration)); }
            public void onStopTrackingTouch(SeekBar bar) { dragging = false; if (!locked && !live && player != null && duration > 0) { position = duration * bar.getProgress() / 10000; player.setTime(position, true); } revealControls(); }
        });
        root.addOnLayoutChangeListener((v,a,b,c,d,e,f,g,h) -> layoutVideo());
    }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private GradientDrawable round(int color,int radius) { GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(radius)); return shape; }
    private TextView controlButton(String label,int background,int color) { TextView view = new TextView(activity); view.setText(label); view.setTextColor(color); view.setTextSize(10); view.setGravity(Gravity.CENTER); view.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL)); view.setBackground(round(background,14)); view.setClickable(true); return view; }
    private void scheduleHide() { ui.removeCallbacks(hideControls); if (!fullscreen && playing && !dragging && !normalTouching) ui.postDelayed(hideControls,3000); }
    private void revealControls() { if (controls == null || !controlsRequested) return; controls.setVisibility(View.VISIBLE); scheduleHide(); }
    private long seekTarget(long target) { return Math.max(0,Math.min(Math.max(0,duration-100),target)); }
    private void step(long delta) { if (locked || live || player == null || duration<=0) return; position = seekTarget(position+delta); player.setTime(position,true); revealControls(); }
    private boolean normalTouch(View view,MotionEvent event) {
        if (fullscreen || locked || root == null) return false;
        int action = event.getActionMasked();
        if (action==MotionEvent.ACTION_DOWN) {
            normalTouching=true; normalMoved=normalSeeking=false; normalStartX=event.getRawX(); normalStartY=event.getRawY(); normalStartTime=position; normalTarget=position;
            ui.removeCallbacks(hideControls); ui.removeCallbacks(hideFeedback); return true;
        }
        if (!normalTouching) return false;
        if (action==MotionEvent.ACTION_MOVE) {
            float dx=event.getRawX()-normalStartX,dy=event.getRawY()-normalStartY;
            if (Math.max(Math.abs(dx),Math.abs(dy))>ViewConfiguration.get(activity).getScaledTouchSlop()) normalMoved=true;
            if (!normalSeeking && normalMoved && !live && duration>0 && Math.abs(dx)>Math.abs(dy)*1.2) normalSeeking=true;
            if (normalSeeking) {
                long span=Math.min(120000,Math.max(30000,duration/5)); normalTarget=seekTarget(normalStartTime+(long)(dx/Math.max(1,root.getWidth())*span));
                long delta=normalTarget-normalStartTime;
                feedback.setText((delta>=0 ? "快进 +" : "后退 −")+clock(Math.abs(delta))+"\n"+clock(normalTarget)+" / "+clock(duration)); feedback.setVisibility(View.VISIBLE);
            }
            return true;
        }
        if (action==MotionEvent.ACTION_UP || action==MotionEvent.ACTION_CANCEL) {
            boolean seekGesture=normalSeeking; normalTouching=false; normalSeeking=false;
            if (action==MotionEvent.ACTION_UP && seekGesture && player != null) { position=normalTarget; player.setTime(normalTarget,true); ui.postDelayed(hideFeedback,900); revealControls(); }
            else { feedback.setVisibility(View.GONE); if (action==MotionEvent.ACTION_UP && !normalMoved) { if (controls.getVisibility()==View.VISIBLE) controls.setVisibility(View.GONE); else revealControls(); } else scheduleHide(); }
            return true;
        }
        return true;
    }
    private String clock(long value) { long s = Math.max(0, value / 1000); return s >= 3600 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", s/3600,s/60%60,s%60) : String.format(java.util.Locale.ROOT, "%d:%02d",s/60,s%60); }
    private void layoutVideo() {
        if (root == null) return;
        int width = root.getWidth(), height = root.getHeight();
        if (width <= 0 || height <= 0) return;
        // MediaCodec direct rendering can omit onNewVideoLayout. Always provide
        // the output window size, then use the actual track as the aspect fallback.
        if (player != null) {
            player.getVLCVout().setWindowSize(width,height);
            if (videoWidth <= 0 || videoHeight <= 0) {
                org.videolan.libvlc.interfaces.IMedia.VideoTrack track = player.getCurrentVideoTrack();
                if (track != null) {
                    boolean rotated = track.orientation == 5 || track.orientation == 6;
                    videoWidth = rotated ? track.height : track.width; videoHeight = rotated ? track.width : track.height;
                    sarNum = Math.max(1,rotated ? track.sarDen : track.sarNum); sarDen = Math.max(1,rotated ? track.sarNum : track.sarDen);
                }
            }
        }
        if (videoWidth <= 0 || videoHeight <= 0) return;
        double aspect = videoWidth * (double) sarNum / Math.max(1, videoHeight * sarDen);
        int targetW = width, targetH = height;
        // Fill stretches to the screen; it never crops the picture.
        if (!fill) { if (width / (double)height > aspect) targetW = (int)(height * aspect); else targetH = (int)(width / aspect); }
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(Math.max(1,targetW),Math.max(1,targetH),Gravity.CENTER);
        video.setLayoutParams(p);
        if (player != null) { player.getVLCVout().setWindowSize(Math.max(1,targetW),Math.max(1,targetH)); player.setAspectRatio(fill ? targetW + ":" + targetH : null); player.setScale(0); }
    }
    private void discardPlayer() {
        MediaPlayer old = player; ParcelFileDescriptor fd = descriptor;
        player = null; descriptor = null;
        if (old == null) { try { if (fd != null) fd.close(); } catch (Exception ignored) {} return; }
        old.setEventListener(null); old.getVLCVout().detachViews();
        disposal.execute(() -> { try { old.stop(); old.release(); } finally { try { if (fd != null) fd.close(); } catch (Exception ignored) {} } });
    }
    private void open(JSONObject input) throws Exception {
        generation = input.getInt("generation"); attach();
        discardPlayer(); position = duration = 0; playing = metadata = false;
        videoWidth = videoHeight = 0;
        synchronized (events) { events.clear(); }
        String source = input.getString("src");
        Media media;
        if (source.startsWith("content://")) {
            descriptor = activity.getContentResolver().openFileDescriptor(Uri.parse(source), "r");
            if (descriptor == null) throw new IllegalStateException("无法读取视频文件");
            media = new Media(vlc, descriptor.getFileDescriptor());
        } else media = new Media(vlc, source.startsWith("/") ? Uri.fromFile(new java.io.File(source)) : Uri.parse(source));
        media.setHWDecoderEnabled(true, false);
        media.addOption(":network-caching=1500"); media.addOption(":file-caching=500");
        player = new MediaPlayer(vlc);
        MediaPlayer active = player; int ticket = generation;
        player.getVLCVout().setVideoView(video);
        player.getVLCVout().attachViews((out,w,h,vw,vh,sn,sd) -> {
            if (released || player != active || ticket != generation) return;
            videoWidth = vw > 0 ? vw : w; videoHeight = vh > 0 ? vh : h; sarNum = Math.max(1,sn); sarDen = Math.max(1,sd);
            layoutVideo();
        });
        player.setEventListener(event -> {
            if (released || player != active || ticket != generation) return;
            switch (event.type) {
                case MediaPlayer.Event.Playing: playing = true; root.setKeepScreenOn(true); layoutVideo(); if (controls.getVisibility()==View.VISIBLE) scheduleHide(); emit("play", null); break;
                case MediaPlayer.Event.Vout: layoutVideo(); break;
                case MediaPlayer.Event.Paused: playing = false; root.setKeepScreenOn(false); if (!fullscreen) revealControls(); emit("pause", null); break;
                case MediaPlayer.Event.EndReached: playing = false; root.setKeepScreenOn(false); emit("ended", null); break;
                case MediaPlayer.Event.EncounteredError: playing = false; root.setKeepScreenOn(false); emit("error", "LibVLC 无法播放此视频，请检查文件、地址或访问权限"); break;
                case MediaPlayer.Event.TimeChanged: position = Math.max(0,event.getTimeChanged()); break;
                case MediaPlayer.Event.LengthChanged: duration = Math.max(0,event.getLengthChanged()); break;
            }
            if (!metadata && duration > 0) { metadata = true; emit("loadedmetadata", null); }
        });
        player.setMedia(media); media.release(); player.play(); emit("ready", null);
    }
    public void command(String json) {
        ui.post(() -> {
            if (released) return;
            try {
                JSONObject input = new JSONObject(json); String action = input.getString("action");
                if (action.equals("open")) {
                    int ticket = input.getInt("generation");
                    if (ticket < generation) return;
                    generation = ticket;
                    // uni-app mounts components before its page WebView becomes visible.
                    // Never bind to a preloaded "View" or the previous page underneath.
                    if (root == null && findWeb(activity.getWindow().getDecorView()) == null) {
                        int attempts = input.optInt("attempts");
                        if (attempts >= 60) throw new IllegalStateException("播放页面尚未就绪，请重试");
                        input.put("attempts", attempts + 1);
                        ui.postDelayed(() -> { if (!released && generation == ticket) command(input.toString()); }, 80);
                        return;
                    }
                    open(input);
                }
                else if (action.equals("layout")) {
                    if (root == null && findWeb(activity.getWindow().getDecorView()) == null) return;
                    attach();
                    FrameLayout.LayoutParams p;
                    if (input.optBoolean("fullscreen")) p = new FrameLayout.LayoutParams(-1,-1);
                    else {
                        double scale = web.getWidth() / Math.max(1.0,input.optDouble("viewportWidth",web.getWidth()));
                        int[] origin = new int[2], parent = new int[2]; web.getLocationOnScreen(origin); ((View)root.getParent()).getLocationOnScreen(parent);
                        p = new FrameLayout.LayoutParams(Math.max(1,(int)Math.round(input.optDouble("width",1)*scale)),Math.max(1,(int)Math.round(input.optDouble("height",1)*scale)));
                        p.leftMargin = origin[0]-parent[0]+(int)Math.round(input.optDouble("left")*scale); p.topMargin = origin[1]-parent[1]+(int)Math.round(input.optDouble("top")*scale);
                    }
                    fullscreen = input.optBoolean("fullscreen"); if (fullscreen) ui.removeCallbacks(hideControls);
                    root.setLayoutParams(p); fill = input.optBoolean("fill"); layoutVideo();
                } else if (action.equals("controls")) {
                    locked = input.optBoolean("locked");
                    live = input.optBoolean("live"); controlsRequested=input.optBoolean("visible");
                    if (controls != null) {
                        seek.setEnabled(!locked && !live); play.setEnabled(!locked); rewind.setEnabled(!locked && !live); forward.setEnabled(!locked && !live);
                        play.setAlpha(locked ? .45f : 1f); rewind.setAlpha(locked ? .45f : 1f); forward.setAlpha(locked ? .45f : 1f);
                        seek.setVisibility(live ? View.GONE : View.VISIBLE); rewind.setVisibility(live ? View.GONE : View.VISIBLE); forward.setVisibility(live ? View.GONE : View.VISIBLE);
                        controls.setLayoutParams(new FrameLayout.LayoutParams(-1,dp(live ? 40 : 56),Gravity.BOTTOM));
                        if (controlsRequested) revealControls(); else { ui.removeCallbacks(hideControls); controls.setVisibility(View.GONE); }
                    }
                } else if (action.equals("visible")) { if (root != null) root.setVisibility(input.optBoolean("value") ? View.VISIBLE : View.GONE); }
                else if (player != null) {
                    if (action.equals("play")) player.play();
                    else if (action.equals("pause")) player.pause();
                    else if (action.equals("seek") && !live) player.setTime(Math.max(0,input.optLong("value")),true);
                    else if (action.equals("rate")) player.setRate((float)input.optDouble("value",1));
                }
            } catch (Throwable error) { emit("error", error.getMessage() == null ? error.toString() : error.getMessage()); }
        });
    }
    public String poll() {
        JSONObject result = new JSONObject();
        try {
            JSONArray list = new JSONArray(); synchronized(events) { for (JSONObject item : events) list.put(item); events.clear(); }
            result.put("events",list).put("generation",generation).put("currentTime",position/1000.0).put("duration",duration/1000.0).put("playing",playing);
            ui.post(() -> { if (!released && time != null) { if (!dragging) { long display=normalSeeking ? normalTarget : position; time.setText(clock(display) + (live ? " · 直播" : " / " + clock(duration))); seek.setProgress(duration > 0 ? (int)(display*10000/duration) : 0); } play.setText(playing ? "Ⅱ" : "▶"); play.setContentDescription(playing ? "暂停" : "播放"); } });
        } catch (Exception ignored) {}
        return result.toString();
    }
    public void release() {
        ui.post(() -> {
            if (released) return; released = true;
            ui.removeCallbacks(hideControls); ui.removeCallbacks(hideFeedback);
            discardPlayer();
            if (root != null) { ((ViewGroup)root.getParent()).removeView(root); root = null; }
            LibVLC old = vlc; vlc = null;
            disposal.execute(() -> { if (old != null) old.release(); }); disposal.shutdown();
        });
    }
}
