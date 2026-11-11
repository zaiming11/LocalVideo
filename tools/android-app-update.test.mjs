import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const sdk = path.join(root, 'tools/.android-build/android35.jar'), gson = path.join(root, 'tools/.android-build/gson.jar')
const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : 'C:/Program Files/Common Files/Oracle/Java/javapath'

test('Android updater migrates to Netlify, retains GitHub selection and pins both APK download channels', { skip: !fs.existsSync(sdk) || !fs.existsSync(gson) || !fs.existsSync(path.join(javaBin, 'javac.exe')) }, t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'localvideo-android-update-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  const sources = {
    'android/content/Context.java': `package android.content; public abstract class Context {
      public Context getApplicationContext(){return this;} public abstract SharedPreferences getSharedPreferences(String name,int mode);
      public String getPackageName(){return "fixture.app";} public android.content.pm.PackageManager getPackageManager(){return new android.content.pm.PackageManager();}
      public java.io.File getExternalFilesDir(String type){return null;}
    }`,
    'android/content/pm/PackageManager.java': `package android.content.pm; public class PackageManager {
      public static final int GET_SIGNATURES=64; public PackageInfo getPackageInfo(String p,int flags){return new PackageInfo();}
      public PackageInfo getPackageArchiveInfo(String p,int flags){return new PackageInfo();}
    }`,
    'android/content/pm/PackageInfo.java': 'package android.content.pm; public class PackageInfo { public String versionName="1.0.4",packageName="fixture.app"; public int versionCode=104; public Signature[] signatures; }',
    'org/json/JSONObject.java': `package org.json; import com.google.gson.*; public class JSONObject {
      private final JsonObject value; public JSONObject(){value=new JsonObject();} public JSONObject(String s){value=JsonParser.parseString(s).getAsJsonObject();}
      public JSONObject put(String key,Object item){value.add(key,item instanceof JSONObject?((JSONObject)item).value:new Gson().toJsonTree(item));return this;}
      public boolean has(String key){return value.has(key);} public Object remove(String key){return value.remove(key);}
      public String optString(String key){return optString(key,"");} public String optString(String key,String fallback){return value.has(key)?value.get(key).getAsString():fallback;}
      public boolean optBoolean(String key,boolean fallback){return value.has(key)?value.get(key).getAsBoolean():fallback;}
      public String getString(String key){return value.get(key).getAsString();} public int getInt(String key){return value.get(key).getAsInt();} public long getLong(String key){return value.get(key).getAsLong();}
      public String toString(){return value.toString();}
    }`,
    'UpdateCheck.java': `import android.content.*; import io.localvideo.update.UpdateAgent; import org.json.JSONObject; import java.util.*; import java.lang.reflect.*;
    public class UpdateCheck {
      static final String URL="https://localcinema-zaiming11.netlify.app/updates/version.json";
      static final String GITHUB="https://github.com/zaiming11/LocalVideo/releases/latest/download/version.json";
      static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
      public static void main(String[] args) throws Exception {
        Map<String,String> values=new HashMap<>();
        SharedPreferences.Editor editor=(SharedPreferences.Editor)Proxy.newProxyInstance(UpdateCheck.class.getClassLoader(),new Class[]{SharedPreferences.Editor.class},(p,m,a)->{
          if(m.getName().equals("putString")){values.put((String)a[0],(String)a[1]);return p;} if(m.getName().equals("remove")){values.remove(a[0]);return p;} if(m.getName().equals("commit"))return true;return null;
        });
        SharedPreferences preferences=(SharedPreferences)Proxy.newProxyInstance(UpdateCheck.class.getClassLoader(),new Class[]{SharedPreferences.class},(p,m,a)->{
          if(m.getName().equals("getString"))return values.getOrDefault(a[0],(String)a[1]);if(m.getName().equals("contains"))return values.containsKey(a[0]);if(m.getName().equals("edit"))return editor;return null;
        });
        Context context=new Context(){public SharedPreferences getSharedPreferences(String name,int mode){return preferences;}};
        UpdateAgent agent=new UpdateAgent();agent.configure(context);
        JSONObject first=new JSONObject(agent.getConfig());check(URL.equals(first.getString("manifestUrl")),"Wrong Netlify default");check(first.optBoolean("configured",false)&&first.optBoolean("autoCheck",false),"First launch requires setup");
        agent.saveConfig(new JSONObject().put("manifestUrl","https://other.example/version.json").put("username","fixture").put("password","secret").put("autoCheck",false).toString());
        UpdateAgent restarted=new UpdateAgent();restarted.configure(context);JSONObject saved=new JSONObject(restarted.getConfig());
        check(!saved.optBoolean("autoCheck",true)&&URL.equals(saved.getString("manifestUrl")),"Preference not remembered");check(!values.get("updateSource").contains("secret")&&!saved.has("password"),"Saved credentials");
        agent.saveConfig(new JSONObject().put("source","github").toString());
        check(GITHUB.equals(new JSONObject(restarted.getConfig()).getString("manifestUrl")),"GitHub selection lost");
        values.remove("updateSource");values.put("githubSource",new JSONObject().put("autoCheck",false).toString());
        JSONObject migrated=new JSONObject(restarted.getConfig());check(URL.equals(migrated.getString("manifestUrl"))&&!migrated.optBoolean("autoCheck",true)&&!values.containsKey("githubSource"),"Legacy channel migration failed");
        values.put("source","obsolete encrypted fixture");restarted.getConfig();check(!values.containsKey("source"),"Legacy credential not removed");
        Method target=UpdateAgent.class.getDeclaredMethod("downloadUrl",JSONObject.class,String.class);target.setAccessible(true);
        String file="LocalVideo-1.0.5-Android.apk", pinned="https://github.com/zaiming11/LocalVideo/releases/download/v1.0.5/"+file;
        check(pinned.equals(target.invoke(null,new JSONObject().put("downloadUrl",pinned),file).toString()),"Pinned URL changed");
        String netlify="https://localcinema-zaiming11.netlify.app/updates/"+file;
        check(netlify.equals(target.invoke(null,new JSONObject().put("downloadUrl",netlify),file).toString()),"Netlify APK rejected");
        for(String invalid:new String[]{pinned.replace("https:","http:"),pinned.replace("github.com","evil.example"),pinned.replace("/LocalVideo/","/Other/"),pinned+"?secret=1",pinned.replace(file,"other.apk")}){
          try{target.invoke(null,new JSONObject().put("downloadUrl",invalid),file);throw new AssertionError("Accepted invalid URL");}catch(InvocationTargetException expected){check(expected.getCause() instanceof java.io.IOException,"Wrong rejection");}
        }
        for(String invalid:new String[]{netlify.replace("https:","http:"),netlify.replace("localcinema-zaiming11","other"),netlify.replace("/updates/","/other/"),netlify+"?token=secret",netlify+"#fragment",netlify.replace(file,"other.apk")}){
          try{target.invoke(null,new JSONObject().put("downloadUrl",invalid),file);throw new AssertionError("Accepted invalid Netlify URL");}catch(InvocationTargetException expected){check(expected.getCause() instanceof java.io.IOException,"Wrong Netlify rejection");}
        }
        Method routes=UpdateAgent.class.getDeclaredMethod("updateSources",java.net.URL.class,JSONObject.class);routes.setAccessible(true);
        check(((List)routes.invoke(null,new java.net.URL(URL),new JSONObject())).size()==1,"Netlify sent through GitHub mirror");
        check(((List)routes.invoke(null,new java.net.URL(GITHUB),new JSONObject())).size()==2,"GitHub mirror fallback removed");
        System.out.println("Android GitHub update checks passed");
      }
    }`
  }
  const files = Object.entries(sources).map(([name, source]) => { const file = path.join(work, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); return file })
  const run = (exe, args) => { const result = spawnSync(path.join(javaBin, exe), args, { encoding: 'utf8', timeout: 30000, windowsHide: true }); assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout); return result.stdout }
  run('javac.exe', ['-encoding', 'UTF-8', '--release', '8', '-classpath', sdk + path.delimiter + gson, '-d', work, ...files, path.join(root, 'native/tvbox/src/io/localvideo/update/UpdateAgent.java')])
  assert.match(run('java.exe', ['-cp', [work, sdk, gson].join(path.delimiter), 'UpdateCheck']), /Android GitHub update checks passed/)
})
