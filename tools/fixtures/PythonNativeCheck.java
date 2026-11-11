import io.localvideo.tvbox.PythonRuntime;
import io.localvideo.tvbox.PythonSpider;
import org.json.*;
import java.io.File;

public final class PythonNativeCheck {
    static void check(boolean value,String label){if(!value)throw new AssertionError(label);}
    static JSONObject call(PythonRuntime runtime,String action,String id,String source,JSONObject args)throws Exception{
        return (JSONObject)runtime.execute(new JSONObject().put("id",id).put("source",source).put("site",new JSONObject().put("api","https://fixture.test/spider.py").put("ext","配置😀")).put("action",action).put("args",args).put("proxy","http://127.0.0.1:1234/proxy?do=py&py="+id));
    }
    public static void main(String[] args)throws Exception{
        PythonRuntime runtime=new PythonRuntime(null,new File(args[0],"cache"),args[0]+"/assets",args[1]);
        runtime.prepare();
        String source="from base.spider import Spider as Base\nimport ssl, urllib.request, http.cookiejar, gzip, zlib, requests, bs4, json\nclass Spider(Base):\n def init(self,extend=''):\n  self.extend=extend\n  ssl.create_default_context()\n def homeContent(self,filter):\n  value=(self.getCache('visits') or 0)+1\n  self.setCache('visits',value)\n  return {'class':[{'type_id':'1','type_name':'原生验证😀'}], 'list':[{'vod_id':'fixture','vod_name':self.extend,'visits':value}]}\n def categoryContent(self,tid,pg,filter,extend):\n  return {'list':[{'vod_id':tid,'vod_name':pg}]}\n def searchContent(self,key,quick,pg='1'):\n  return {'list':[{'vod_id':key,'vod_name':pg}]}\n def detailContent(self,ids):\n  return {'list':[{'vod_id':ids[0],'vod_play_url':'第1集$opaque'}]}\n def playerContent(self,flag,id,vipFlags):\n  return {'url':'https://fixture.test/video.mp4','parse':0,'header':{'Referer':flag}}\n def localProxy(self,params):\n  return [200,'application/octet-stream',bytes([0,255,16])]\n";
        JSONObject home=call(runtime,"home","fixture",source,new JSONObject());
        check(home.getJSONArray("class").getJSONObject(0).getString("type_name").equals("原生验证😀"),"JNI UTF-8 lost");
        check(home.getJSONArray("list").getJSONObject(0).getString("vod_name").equals("配置😀"),"Python extension lost");
        check(call(runtime,"category","fixture",source,new JSONObject().put("id","1").put("page",2)).getJSONArray("list").getJSONObject(0).getString("vod_name").equals("2"),"category failed");
        check(call(runtime,"search","fixture",source,new JSONObject().put("keyword","测试").put("page",3)).getJSONArray("list").getJSONObject(0).getString("vod_name").equals("3"),"search failed");
        check(call(runtime,"detail","fixture",source,new JSONObject().put("id","opaque")).getJSONArray("list").getJSONObject(0).getString("vod_id").equals("opaque"),"detail failed");
        check(call(runtime,"play","fixture",source,new JSONObject().put("flag","https://fixture.test/").put("url","opaque")).getJSONObject("header").getString("Referer").equals("https://fixture.test/"),"play failed");
        JSONObject proxy=call(runtime,"proxy","fixture",source,new JSONObject());check(proxy.getBoolean("binary")&&proxy.getString("body").equals("AP8Q"),"binary proxy failed");
        System.out.println("PYTHON_NATIVE_FIXTURE_OK "+new JSONObject().put("sdk",android.os.Build.VERSION.SDK_INT).put("abi",args[2]).put("ssl",true).put("requests",true).put("beautifulsoup",true));
        if(args.length>3){
            JSONObject site=new JSONObject().put("api",args[3]).put("ext","");PythonSpider spider=new PythonSpider(runtime,"live-source",site);
            JSONObject result=(JSONObject)spider.execute("home",new JSONObject());
            System.out.println("PYTHON_LIVE_SOURCE "+new JSONObject().put("categories",result.optJSONArray("class")==null?0:result.getJSONArray("class").length()).put("recommendations",result.optJSONArray("list")==null?0:result.getJSONArray("list").length()).put("sourceWarning",result.optString("sourceWarning")));
        }
    }
}
