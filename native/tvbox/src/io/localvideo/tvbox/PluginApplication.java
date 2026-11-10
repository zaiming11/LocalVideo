package io.localvideo.tvbox;

import android.app.Application;
import android.content.ComponentCallbacks;
import android.content.Context;

/** Application facade for plugins whose secondary DEX loader uses Context.getClassLoader(). */
public final class PluginApplication extends Application {
    private final Application application;
    private final ClassLoader hostLoader;
    public PluginApplication(Application application, ClassLoader hostLoader) {
        this.application = application;
        this.hostLoader = hostLoader;
        attachBaseContext(application);
    }
    @Override public ClassLoader getClassLoader() { return hostLoader; }
    @Override public Context getApplicationContext() { return this; }
    @Override public void registerActivityLifecycleCallbacks(ActivityLifecycleCallbacks callback) { application.registerActivityLifecycleCallbacks(callback); }
    @Override public void unregisterActivityLifecycleCallbacks(ActivityLifecycleCallbacks callback) { application.unregisterActivityLifecycleCallbacks(callback); }
    @Override public void registerComponentCallbacks(ComponentCallbacks callback) { application.registerComponentCallbacks(callback); }
    @Override public void unregisterComponentCallbacks(ComponentCallbacks callback) { application.unregisterComponentCallbacks(callback); }
    @Override public void registerOnProvideAssistDataListener(OnProvideAssistDataListener callback) { application.registerOnProvideAssistDataListener(callback); }
    @Override public void unregisterOnProvideAssistDataListener(OnProvideAssistDataListener callback) { application.unregisterOnProvideAssistDataListener(callback); }
}
