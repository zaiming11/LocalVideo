package com.github.catvod.crawler;
public final class SpiderDebug {
    public static void log(String message) { android.util.Log.d("TVBoxSpider", message == null ? "" : message); }
    public static void log(Throwable error) { android.util.Log.w("TVBoxSpider", error); }
}
