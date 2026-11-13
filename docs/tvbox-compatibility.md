# TVBox 接入与验证记录

核对日期：2026-11-09。分支：feat/tvbox-integration，基线：35281a2。改动尚未提交或发布。

## 当前方案

- Windows 最新方案（1.1.0-alpha.3）：原生桌面端独立运行，支持 XML / JSON、Type 4 HTTP 接口、直播列表及本地视频。安装包不包含安卓环境或引擎 APK，应用不调用模拟器或 ADB，也不依赖手机。此决定替代之前的配套安卓环境方案。
- Android CSP/JAR/DEX 站点在 Windows 中标记为不兼容，不启动外部环境；请选择 PC 兼容的 HTTP 接口源。旧配置会按当前平台重新判断兼容性，原有本地媒体库和更新设置保留。
- Android App：在本机加载 CSP/JAR、JS Spider（含 drpy）和 Python 3 Spider。JAR 宿主包含 Spider API、异步调用、DEX 加载、MD5 校验、ARM 库提取和本机媒体代理；JS 在独立隐藏 WebView 中执行 ES 模块；Python 使用按需下载并校验的原生 CPython 3.11，支持标准 TVBox Python Spider 接口。
- 插件仅在用户配置选中的站点被使用时下载，不把第三方 Spider 打进安装包。依赖及许可证位于 static/tvbox-native。
- 不能把“可尝试连接”理解为已验证完整兼容。JS Spider 使用 Android System WebView，不包含 QuickJS/Sardine 原生运行库；Python 的特殊二进制扩展及网页嗅探仍需额外适配。格式与实测边界见 [Android JS Spider](android-js-spider.md) 和 [Android Python Spider](android-python-spider.md)。

## 首页与设置

首页直接展示 TVBox 片单；底部为 TVBox、媒体库、文件夹、最近、设置。
配置地址只在设置中编辑。有仓库列表时左上角显示仓库下拉，无仓库时隐藏；右上角为站点/直播下拉。
首次载入仓库和站点默认选择第一条。主页不额外放置本地视频按钮，本地视频从媒体库进入。
配置、仓库列表保存在本机，在线队列与本地媒体库分开保存。

### 网页端本地配置文件夹

在“设置 → 在线片库”点击“加载本地配置文件夹”，授权浏览器读取所选目录后，手动选择其中的 JSON / JSON5 / TXT / CONF 主配置。支持同目录和子目录的仓库配置、HTTP JSON 接口文件、直播列表及图片相对路径；HTTP 远程接口继续使用原有代理。网页端不会执行 Android JAR / DEX / Spider 插件。

所选文件仅保存在当前浏览器的 IndexedDB，不上传服务器，刷新页面后可继续使用。更换浏览器、清理站点数据后需重新选择；本地文件修改后也需重新选择文件夹以更新副本。单个配置文件上限 8 MiB，整个文件夹上限 256 MiB、4000 个文件，主配置最多 64 个；目录选择功能需浏览器支持，建议使用新版 Edge 或 Chrome。

## 实测

### Android 插件 Application 上下文修复（1.0.3）

用户在正式 APK 中选择“韩剧 | 秒播”时遇到 `PandoraEntryActivity cannot be cast to android.app.Application`。原 Bridge.configure 保存了页面 Activity，并将其同时传给插件 Init.init 和 Spider.init。现改为从宿主 Context 获取并校验 Application，再供两个初始化入口使用，避免持有 Activity。
回归测试编译真实 Bridge 源码，以 Activity/Application 测试替身验证插件的 Application 强转能通过，并拒绝缺失应用上下文的调用。原生 DEX 已重新构建，版本哈希同步更新以切换旧缓存。正式 APK 内的 bridge.jar 及 app-service.js 引用哈希均已核对，签名与旧版一致。

按用户要求改用夜神 Android 7.1 / API 25 验证。以相同 Bridge 编译的测试宿主执行“王二小 → 💥韩剧┃秒播💥”（csp_WexAiHanXiaoQuanGuard）：首页返回 3 个分类、174 条内容；首个分类返回 24 条影片；“背着善宰跑”详情返回 16 集。未出现 Application 强转异常，TVBoxBridge/AndroidRuntime 错误日志为空。此结果属于原生插件调用链验证，不是 HBuilder 正式 APK 完整界面验收；播放调用未返回可直接播放的 HTTP 地址，未确认实际视频播放。夜神窗口截图接口超时。

最终按用户选择保留 arm64 手机修复包 `desktop/dist/LocalVideo-1.0.3-Android.apk`（versionCode 103）；取消双架构排队并恢复原有架构配置，不将测试宿主作为手机安装包分发。

### Windows 安装版片单空白修复（1.1.0-alpha.4）

截图中的分类和页码正常、片单空白，是桌面渲染过程中两个异常导致：沙箱 preload 没有全局 Buffer；Vue 响应式请求头也不能直接通过 Electron contextBridge 克隆。现使用 TextEncoder/btoa 编码媒体代理地址，并将请求头复制为普通对象后传入桥接。
新增两项回归测试，分别覆盖无全局 Buffer 的沙箱和响应式请求头跨桥接。另使用实际打包的 preload、页面和媒体代理模块加载创享影视配置，确认返回 20 张影片卡片及海报，不再出现上述渲染异常。Android 1.0.2 / versionCode 102 已用原云端证书构建，包名及签名保持一致。

### 2026-11-11 片单与图片连接中断

针对 `xgg.json` 中 HTTP 站点的浏览器反馈，实际读取到 20 条影片，其中 19 条包含图片地址；图片域名 `1028.slp261028.top` 在直接请求和附带 Referer 时均复现连接重置。未据此认定源永久失效，也未确认线上海报恢复。

浏览器开发代理和 Windows 共用的网络模块现对连接重置、响应意外中断等短暂错误最多重试一次，第一次失败超过 8 秒或请求已取消时不重试；403/404 和证书错误不重试。配置读取覆盖正文中断；媒体代理仅在返回响应流前重试，保留请求头、源 URL 和 Range 行为。封面最终失败时显示占位，不提供图片点击重试；重新成功读取片单后会重新尝试加载图片。片单的手动重试入口保留。

### Windows 独立版 1.1.0-alpha.3

2026-11-09 本地生成 `desktop/dist/LocalVideo-1.1.0-alpha.3-Windows-x64-Setup.exe`，116,343,229 字节（约 111 MiB），尚未上传坚果云或 GitHub。
63 项自动测试、H5 构建和 BAT 环境检查通过。打包产物检查确认没有安卓运行环境、引擎 APK、原生插件资源或 Android IPC，保留 HTTP 源、文件夹导入及更新接口。
隔离测试配置的 EXE 启动检查通过：首次 10.76 秒、第二次 0.53 秒到窗口可显示；这些数字不代表所有机器的启动耗时，也不代表完成所有远程源的实际播放验收。

### http://www.y456y.com

普通浏览器 UA 可能得到网页；使用 okhttp/3.12.13 得到 TVBox JSON。
本次配置包含 107 个 type 3 / csp_ 站点及一组插件代理直播。
插件 4,051,422 字节，MD5 c91563ada7c35b4f33bd81c50c96eab5，与配置声明一致。
包含 classes.dex 和 FishGuard-v7.so / FishGuard-v8.so，不含 JVM class，因此 Windows 不直接执行。

Android PJE110 / Android 36 / HBuilder 标准调试基座实测：
- 成功加载插件，并返回“片单精选”的分类和真实影片列表。
- “玩偶 4K”返回真实海报、分类、“好莱坞艺术学院”的详情和选集。
- 详情过程中插件弹出夸克网盘登录提示；未登录，因此该线路的媒体播放尚未验证。
- 未逐个验证 107 个站点，未验证此配置的插件代理直播。
- 尚未验证独立 APK 安装后的资源复制、插件加载及媒体代理播放。

### PC 兼容源

https://ys.cxkjg.cn/api/provide/tvbox 返回 12 个 HTTP JSON 站点。
“创享影视”返回分类、列表、详情和多线路选集；真实剧集在浏览器实际播放，readyState=4、videoWidth=1920，播放进度超过 50 秒。
本地 fixture 另验证了配置/仓库、分类、搜索、详情、Type 4 解析、XML、直播列表、Range 和 HLS 分片/密钥地址重写；HLS 实际播放通过。

其他地址：raw.liucn.cc/box/m.json 包含 HTTP 接口站点；cnb.cool/fish2018/xs/-/git/raw/main/api.json 本次 HTTP 403；xhztv.top/4k.json 本次未通过 JSON5 解析。未据此承诺其播放能力。

## 验证与构建

运行 node --test tools/*.test.mjs desktop/test/*.test.cjs：54 项通过，包含原有目录导入、自然排序、续播、全屏锁定与手势回归。
H5 生产构建已通过；Windows 打包资源包含 tvbox-network.cjs、HLS 组件，排除 static/tvbox-native。
历史上曾生成配套安卓环境测试包；该方案现已停用，其实测记录保留在 windows-android-runtime.md，仅供历史参考，不是当前安装步骤。

Android 宿主重建：先安装 desktop 的 npm 依赖，再运行 node tools/build-tvbox-android.cjs；需要 JDK（可用 JAVA_HOME 指定）。脚本下载固定版本 Android SDK、R8 和 Maven 依赖，生成 bridge.jar 与版本哈希。
