import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const sdk = path.join(root, 'tools/.android-build/android35.jar')
const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : 'C:/Program Files/Common Files/Oracle/Java/javapath'
test('Android plugin host passes Application to plugin initialization and never retains an Activity', { skip: !fs.existsSync(sdk) || !fs.existsSync(path.join(javaBin, 'javac.exe')) }, t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-context-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  const sources = {
    'android/content/Context.java': 'package android.content; public abstract class Context { public abstract Context getApplicationContext(); public ClassLoader getClassLoader(){ return getClass().getClassLoader(); } public ContentResolver getContentResolver(){ return null; } public SharedPreferences getSharedPreferences(String name, int mode){ return null; } }',
    'android/app/Application.java': `package android.app; public class Application extends android.content.Context {
      public interface ActivityLifecycleCallbacks {} public interface OnProvideAssistDataListener {}
      public ClassLoader loader; public int registrations; protected void attachBaseContext(android.content.Context base) {}
      public android.content.Context getApplicationContext() { return this; }
      public ClassLoader getClassLoader() { return loader == null ? super.getClassLoader() : loader; }
      public void registerActivityLifecycleCallbacks(ActivityLifecycleCallbacks callback) { registrations++; }
      public void unregisterActivityLifecycleCallbacks(ActivityLifecycleCallbacks callback) {}
      public void registerComponentCallbacks(android.content.ComponentCallbacks callback) {}
      public void unregisterComponentCallbacks(android.content.ComponentCallbacks callback) {}
      public void registerOnProvideAssistDataListener(OnProvideAssistDataListener callback) {}
      public void unregisterOnProvideAssistDataListener(OnProvideAssistDataListener callback) {}
    }`,
    'android/app/Activity.java': 'package android.app; public class Activity extends android.content.Context { private final Application app; public Activity(Application app) { this.app=app; } public android.content.Context getApplicationContext() { return app; } }',
    'PluginContextCheck.java': `
import android.app.*;
import android.content.Context;
import io.localvideo.tvbox.Bridge;
public class PluginContextCheck {
  static void check(Context host, Application expected, String directory) throws Exception {
    Bridge bridge = new Bridge();
    bridge.configure(host, directory);
    java.lang.reflect.Field field = Bridge.class.getDeclaredField("context"); field.setAccessible(true);
    // The same cast performed by plugins that failed with PandoraEntryActivity.
    Application pluginApplication = (Application)field.get(bridge);
    if (expected.loader == null && pluginApplication != expected) throw new AssertionError("Plugin did not receive the process Application");
    if (expected.loader != null) {
      if (pluginApplication.getClassLoader() != Bridge.class.getClassLoader()) throw new AssertionError("Child DEX plugins cannot resolve the host API");
      if (pluginApplication.getApplicationContext() != pluginApplication) throw new AssertionError("Nested application context lost the host loader");
      pluginApplication.registerActivityLifecycleCallbacks(null);
      if (expected.registrations != 1) throw new AssertionError("Lifecycle callback was not forwarded to the real Application");
    }
    java.lang.reflect.Field server = Bridge.class.getDeclaredField("server"); server.setAccessible(true);
    ((java.net.ServerSocket)server.get(bridge)).close();
  }
  public static void main(String[] args) throws Exception {
    Application app = new Application();
    check(new Activity(app), app, args[0]);
    check(app, app, args[0]);
    Application isolated = new Application(); isolated.loader = new ClassLoader(null) {};
    check(new Activity(isolated), isolated, args[0]);
    try { new Bridge().configure(new Activity(null), args[0]); throw new AssertionError("Missing Application accepted"); }
    catch (IllegalArgumentException expected) {}
    System.out.println("Application context checks passed");
  }
}`
  }
  const files = Object.entries(sources).map(([name, source]) => {
    const file = path.join(work, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); return file
  })
  const run = (exe, args) => { const result = spawnSync(path.join(javaBin, exe), args, { encoding: 'utf8', timeout: 30000, windowsHide: true }); assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout); return result.stdout }
  run('javac.exe', ['-encoding', 'UTF-8', '--release', '8', '-classpath', sdk, '-d', work, ...files, ...['Bridge.java', 'HttpTransport.java', 'PluginApplication.java', 'LocalResources.java'].map(name => path.join(root, 'native/tvbox/src/io/localvideo/tvbox', name))])
  assert.match(run('java.exe', ['-cp', work + path.delimiter + sdk, 'PluginContextCheck', path.join(work, 'cache')]), /Application context checks passed/)
})
