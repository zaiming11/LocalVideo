# Android Python Spider

Android 已接入原生 CPython 3.11.17，支持 Type 3 HTTP/HTTPS `.py` 站点和本地配置文件夹中的 Python 源文件。用户无需安装 Python、Termux 或其他独立环境。Windows 和浏览器不运行本次 Python 引擎。

## 运行与依赖

- 需要 Android 7.0 / API 24 或更新版本，以及 ARM64 / ARMv7 进程。其他 Android 功能继续沿用项目原来的最低系统版本。
- 原生解释器及标准库首次使用时从固定的原始 Maven 发布地址下载，约 9–10 MB；按架构选择。对大小和 SHA-256 校验后只解压允许的原生库／扩展目录，缓存到 App 私有目录，随后复用。
- 安装资源只新增约 1.1 MiB：JNI 桥接、宿主适配、CA 证书和纯 Python 依赖，不把两种架构的整个解释器塞进项目静态资源。首次下载失败后可重试，完成校验的压缩包继续复用。
- 自带 requests、urllib3、Beautiful Soup、soupsieve、charset-normalizer、idna、certifi 和 typing-extensions。完整标准库包含 SSL、Cookie、urllib、gzip、zlib 等。
- 支持导出 `Spider` 类，提供 `init`、`homeContent`、可选 `homeVideoContent`、`categoryContent`、两／三参数 `searchContent`、`detailContent`、`playerContent`、`localProxy` 调用。保留不透明选集 ID、播放请求头及二进制代理响应。
- 提供 `base.spider.Spider`，包含 requests 会话、请求头／Cookie、分站点持久缓存、代理地址和常用文本辅助方法。脚本命名空间分离，最多保留四个实例；这是进程内执行，不能理解为操作系统沙箱。
- 未内置 lxml、PyCryptodome 等特殊原生扩展；缺少依赖会明确显示模块名，不把所有 `.py` 站点一概承诺为兼容。Python 2 语法也不在本次范围内。
- Python 代码逐行检查约 45 秒的执行期限；底层 C 扩展或网络阻塞仍受其自身超时控制。原生桥接返回值上限为 8 MB，二进制代理通过 Base64 传输，因此不适合一次缓冲整部大视频。

更新后的原生 DEX、Python 资源与版本哈希必须一起使用，并重新启动 App。仅刷新在线 TVBox 配置不能让旧安装资源获得执行器。

## 有分类但片单为空

部分 Python 源的分类写在脚本内，内容则需要另外请求网站。宿主观察标准 `urllib` opener 和 `requests.Session` 请求：如果请求失败被第三方脚本捕获，且首页、分类或搜索最终返回空列表，则通过 `sourceWarning` 提示失败域名与 HTTP 状态或连接原因。分类仍保留；同一请求重试成功会清除该请求的失败记录，正常空列表和成功取得片单不增加此提示。提示不包含 URL 路径、查询参数、账号或请求头。

2026-11-11 在 PJE110 上使用生产 CPython/JNI 实际执行原 `51chigua.py`：返回 11 个静态分类、0 条推荐，并取得 `57duanju.org（连接被重置）`。这是内容服务网络失败，不能把静态分类当作内容接口已连通。该源尚未通过实际播放验证。

## 构建

```powershell
npm.cmd ci --prefix tools/js-spider
node tools/build-tvbox-android.cjs
```

沿用项目的 JDK、Android SDK、R8 与 Zig 构建缓存。Python 构建脚本也可单独执行 `node tools/build-tvbox-python.cjs`。版本、下载地址、大小和摘要固定于 `native/tvbox-python/dependencies.json`；生成的清单和 JNI 校验值位于 `static/tvbox-python/runtime.json`。

JNI 通过公开 CPython API 调用原生解释器。原始 CPython DSO 没有 SONAME，构建使用仅供链接的导入库，确保最终 DT_NEEDED 为可移植的 `libpython3.11.so`；导入库不进入 App 或手机。两种 JNI 产物都检查 ARM 架构与 16 KiB 段对齐。Python 标准库和第三方依赖许可证随 `static/tvbox-python/THIRD-PARTY-NOTICES.txt` 保留。

## 2026-11-11 验证

- PJE110 / Android 36 / ARM64，在独立 `app_process` 中加载与 App 相同的生产 DEX、JNI 和 CPython，实际运行 `PythonRuntime.prepare/execute`，未安装测试 APK，也未切换手机当前应用。
- 校验本地缓存后解压的路径通过；随后不预置解释器缓存，实际首次下载、SHA-256 校验、解压、复制纯 Python 依赖和启动的完整路径也通过。
- 实际原生运行验证了 SSL、requests、Beautiful Soup、中文／emoji UTF-8、分类／搜索／详情／播放地址解析与二进制代理。
- 实际下载并执行 `https://rose.tvdog.top/51chigua.py`，返回 11 个分类，推荐列表为 0。尚未确认该源的真实视频播放，不把空片单当作源可用或源永久失效的证明。
- 31 项针对性检查通过，涵盖 Python 依赖、真实 HTTP／Cookie、站点缓存隔离／重载持久化、JNI 依赖与摘要、原有 JS/JAR 调用链和配置／本地导入行为；Android App 前端与 H5 编译通过。
- ARMv7 已编译并检查 ELF，未进行 ARMv7 真机执行；尚未完成打包 APK 中 Python 页面的端到端验收。未打包、安装或发布新 APK。
- 后续已在同一手机的 HBuilder 调试版页面完成 Python 端到端验证：读取配置、显示分类／封面、搜索“夜航”、打开详情、选集解析、携带 Referer 和 Range 请求媒体、LibVLC 实际画面及播放进度（截图约 00:10 / 00:20）均通过。使用项目自有 20 秒演示视频，不以此代替第三方源的视频可用性验证。
- 验证结束恢复原 TVBox 配置和原播放记录；调试版检查不等于正式安装包验收。
- 后续第三方真实配置的结果另见 [2026-11-11 真实资源验证](android-spider-real-data-2026-11-11.md)：原 Python 源仍返回分类但片单为空，未将其记为真实视频播放通过。

## 开发检查

```powershell
# 使用本机 Python 3 运行宿主协议与请求测试：
$env:LOCALVIDEO_TEST_PYTHON = '你的 Python 3 可执行文件绝对路径'
node --test tools/tvbox-python.test.mjs tools/tvbox-js.test.mjs tools/android-plugin-context.test.mjs

# 使用连接设备，预置已校验的运行库，检查实际生产原生执行链：
node tools/check-python-android.cjs <设备序列号> https://rose.tvdog.top/51chigua.py

# 不预置解释器，另验证手机的首次下载与校验：
node tools/check-python-android.cjs <设备序列号> https://rose.tvdog.top/51chigua.py --download
```

原生检查只使用 `/data/local/tmp/localvideo-python-check-<时间戳>` 下的独立测试目录，并在结束时清理；不读取或改写已安装应用的数据。检查结果保存在本机构建缓存中。
