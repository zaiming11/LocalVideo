package io.localvideo.tvbox;

import org.json.*;
import java.util.*;

/** One Python source and its normalized TVBox invocation contract. */
public final class PythonSpider {
    private final PythonRuntime runtime;
    private final JSONObject site;
    private final String id,source;
    public PythonSpider(PythonRuntime runtime,String id,JSONObject site)throws Exception{
        this.runtime=runtime;this.id=id;this.site=site;
        Map<String,String> headers=new HashMap<>();JSONObject supplied=site.optJSONObject("headers");
        if(supplied!=null)for(Iterator<String> keys=supplied.keys();keys.hasNext();){String key=keys.next();headers.put(key,supplied.optString(key));}
        source=HttpTransport.get(site.getString("api"),headers).body;
    }
    public Object execute(String action,JSONObject args)throws Exception{
        return runtime.execute(new JSONObject().put("id",id).put("site",site).put("source",source).put("action",action).put("args",args).put("proxy",Bridge.proxyUrl()+"?do=py&py="+id));
    }
}
