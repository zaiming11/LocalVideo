import io.localvideo.tvbox.SpiderHttp;
import org.json.JSONObject;
import java.util.Collections;

/** Test-only JVM entry point for the exact native req() transport. */
public final class SpiderRequest {
    public static void main(String[] args) throws Exception {
        try {
            System.out.print(SpiderHttp.request(args[0],new JSONObject(args[1]),Collections.emptyMap()));
        } catch(Exception error) {
            System.out.print(new JSONObject().put("error",error.getClass().getSimpleName()+": "+error.getMessage()));
        }
    }
}
