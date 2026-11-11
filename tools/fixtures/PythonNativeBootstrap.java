import dalvik.system.DexClassLoader;
import java.io.File;

/** Test entry point only. It gives the production bridge its own JNI search path. */
public final class PythonNativeBootstrap {
    public static void main(String[] args)throws Exception{
        String root=args[0],version=args[1],abi=args[2];
        File optimized=new File(root,"optimized");optimized.mkdirs();
        String libraries=root+"/cache/python-"+version.substring(0,16)+"/jniLibs/"+abi;
        new File(libraries).mkdirs();
        ClassLoader loader=new DexClassLoader(root+"/check.jar:"+root+"/bridge.jar",optimized.getAbsolutePath(),libraries,Object.class.getClassLoader());
        try{loader.loadClass("PythonNativeCheck").getMethod("main",String[].class).invoke(null,(Object)args);System.exit(0);}
        catch(java.lang.reflect.InvocationTargetException error){error.getCause().printStackTrace();System.exit(1);}
    }
}
