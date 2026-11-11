#include <jni.h>
#include <Python.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *input(JNIEnv *env, jbyteArray value) {
    jsize size = (*env)->GetArrayLength(env, value);
    if (size > 16 * 1024 * 1024) return NULL;
    char *text = malloc((size_t)size + 1);
    if (!text) return NULL;
    (*env)->GetByteArrayRegion(env, value, 0, size, (jbyte *)text);
    text[size] = 0;
    return text;
}
static jbyteArray output(JNIEnv *env, const char *text, Py_ssize_t size) {
    if (size < 0) size = (Py_ssize_t)strlen(text);
    if (size > 8 * 1024 * 1024) {text = "Python 返回数据超过 8 MB";size = (Py_ssize_t)strlen(text);}
    jbyteArray value = (*env)->NewByteArray(env, (jsize)size);
    if (value && size) (*env)->SetByteArrayRegion(env, value, 0, (jsize)size, (const jbyte *)text);
    return value;
}
static jbyteArray error(JNIEnv *env) {
    PyObject *type = NULL, *value = NULL, *trace = NULL;
    PyErr_Fetch(&type, &value, &trace); PyErr_NormalizeException(&type, &value, &trace);
    PyObject *message = value ? PyObject_Str(value) : NULL;
    const char *text = message ? PyUnicode_AsUTF8(message) : NULL;
    jbyteArray result = output(env, text ? text : "Python 原生调用失败", -1);
    Py_XDECREF(message);Py_XDECREF(type);Py_XDECREF(value);Py_XDECREF(trace);PyErr_Clear();
    return result;
}
JNIEXPORT jbyteArray JNICALL Java_io_localvideo_tvbox_PythonRuntime_nativeInitialize(JNIEnv *env, jclass cls, jbyteArray rootBytes, jbyteArray abiBytes) {
    (void)cls;
    if (Py_IsInitialized()) return output(env, "", 0);
    char *root = input(env, rootBytes), *abi = input(env, abiBytes);
    if (!root || !abi) {free(root);free(abi);return output(env, "Python 初始化内存不足", -1);}
    PyPreConfig pre;PyPreConfig_InitIsolatedConfig(&pre);pre.utf8_mode = 1;
    PyStatus status = Py_PreInitialize(&pre);
    if (PyStatus_Exception(status)) {free(root);free(abi);return output(env, status.err_msg ? status.err_msg : "Python 预初始化失败", -1);}
    PyConfig config;PyConfig_InitIsolatedConfig(&config);
    config.install_signal_handlers = 0;config.site_import = 0;config.parse_argv = 0;config.write_bytecode = 0;
    config.module_search_paths_set = 1;
    status = PyConfig_SetBytesString(&config, &config.home, root);
    const char *paths[] = {"stdlib.zip", "requirements.zip", "host", NULL};
    for (int i = 0; !PyStatus_Exception(status) && paths[i]; i++) {
        char path[8192];snprintf(path, sizeof(path), "%s/%s", root, paths[i]);
        wchar_t *wide = Py_DecodeLocale(path, NULL);
        if (!wide) {status = PyStatus_Error("Python 路径编码失败");break;}
        status = PyWideStringList_Append(&config.module_search_paths, wide);PyMem_RawFree(wide);
    }
    if (!PyStatus_Exception(status)) {
        char path[8192];snprintf(path, sizeof(path), "%s/lib-dynload/%s", root, abi);
        wchar_t *wide = Py_DecodeLocale(path, NULL);
        if (wide) {status = PyWideStringList_Append(&config.module_search_paths, wide);PyMem_RawFree(wide);} else status = PyStatus_Error("Python 原生模块路径编码失败");
    }
    if (!PyStatus_Exception(status)) status = Py_InitializeFromConfig(&config);
    jbyteArray result = output(env, PyStatus_Exception(status) ? (status.err_msg ? status.err_msg : "Python 初始化失败") : "", -1);
    PyConfig_Clear(&config);free(root);free(abi);
    if (Py_IsInitialized()) PyEval_SaveThread();
    return result;
}
JNIEXPORT jbyteArray JNICALL Java_io_localvideo_tvbox_PythonRuntime_nativeInvoke(JNIEnv *env, jclass cls, jbyteArray payload) {
    (void)cls;
    if (!Py_IsInitialized()) return output(env, "Python 尚未初始化", -1);
    char *text = input(env, payload);
    if (!text) return output(env, "Python 参数超过限制或内存不足", -1);
    PyGILState_STATE gil = PyGILState_Ensure();
    PyObject *module = PyImport_ImportModule("localvideo_python_host");
    PyObject *function = module ? PyObject_GetAttrString(module, "dispatch") : NULL;
    PyObject *argument = PyUnicode_FromString(text);free(text);
    PyObject *result = function && argument ? PyObject_CallFunctionObjArgs(function, argument, NULL) : NULL;
    jbyteArray value;
    if (result && PyUnicode_Check(result)) {
        Py_ssize_t size;const char *encoded = PyUnicode_AsUTF8AndSize(result, &size);
        value = encoded ? output(env, encoded, size) : error(env);
    } else value = error(env);
    Py_XDECREF(result);Py_XDECREF(argument);Py_XDECREF(function);Py_XDECREF(module);
    PyGILState_Release(gil);
    return value;
}
