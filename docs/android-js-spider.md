# Android JS Spider

Android 支持 Type 3 HTTP/HTTPS `.js` / `.mjs` 引擎，包括 drpy 的 `api: drpy2.min.js` + `ext: 规则.js` 形式。相对地址按配置最终 URL 解析，本地配置文件夹也沿用现有资源服务。Windows 仍独立运行 HTTP 源，不执行 Android JAR 或本次 JS 引擎。

脚本在独立的隐藏 Android WebView 中运行 ES 模块，支持默认导出的 Spider 对象或 `__jsEvalReturn()` 导出的对象。提供 `init/home/homeVod/category/search/detail/play/proxy` 调用，`req`、分站点存储、HTML/JSONPath 解析、CryptoJS、Jinja2 模板、代理地址及常用编码辅助函数。cheerio/crypto-js 的 TVBox 内置资产地址映射到随应用携带的依赖。第三方引擎及规则从用户配置下载，不打入安装包。

隐藏 WebView 不显示页面，不暴露 Activity、文件系统或任意 Java 反射接口；HTTP 请求通过原生桥接执行。单次调用最多等待 50 秒，超时释放执行器，同时最多保留四个站点上下文。需要支持 import map 的 Android System WebView，过旧会提示更新。独立 WebView 是执行上下文隔离，不代表独立操作系统进程。

JS 执行器不能运行 Python `.py`；Python 后续通过独立原生执行器接入，见 [Android Python Spider](android-python-spider.md)。依赖 QuickJS/Sardine 专用原生绑定的脚本及任意浏览器嗅探仍不因此获得完整支持。页面按实际脚本类型说明，不再在 Android 上误提示“Windows 不支持 JAR”。脚本执行成功也不等于上游影视接口可用。

## 连接中断

配置/API 读取和 JS `req` 的 GET 遇到连接重置、连接中止或意外 EOF，且首次失败发生在 8 秒以内时，等待 250 ms 后最多重试一次。POST、证书错误、HTTP 403/404 和普通超时不自动重复。站点页面另提供手动“重试”。不据此自动删除配置、不切换站点。

drpy 返回的 `no_data` 占位条目不作为影片展示；若伴随上游 HTTP 错误，显示具体状态。首页仍可保留已取得的分类，同时提示推荐接口错误。

## 构建与检查

```powershell
npm.cmd ci --prefix tools/js-spider
node tools/build-tvbox-android.cjs
node tools/check-tvbox-js.cjs <配置地址> [站点key]
node --test tools/tvbox-js.test.mjs tools/android-js-http.test.mjs tools/android-plugin-context.test.mjs tools/android-tvbox-http.test.mjs tools/tvbox.test.mjs tools/tvbox-panel.test.mjs tools/tvbox-local-reference.test.mjs tools/tvbox-selection.test.mjs
```

原生构建同时生成 `static/tvbox-js/`、JS 版本哈希、`bridge.jar` 及原生版本哈希。JS 开发依赖在 `tools/js-spider/package-lock.json` 固定，随应用携带的许可证位于 `static/tvbox-js/THIRD-PARTY-NOTICES.txt`。诊断工具使用隔离的 Electron 沙箱和同一 Java 请求实现，不使用用户桌面配置；需要准备 Electron、Android SDK、JDK。首次运行会下载并校验固定版本的 JVM JSON 测试依赖，测试依赖不随应用分发。

## 2026-11-11 验证记录

- 26 项针对性检查通过，覆盖模块、drpy 依赖、分类／搜索／详情／播放／代理、站点隔离、原生 GET/POST、重定向去除凭据、压缩／二进制、短暂中断重试及原有配置选择、本地导入行为。
- 安卓 DEX、App 前端和 H5 前端编译通过；未生成安装包或发布。
- 使用 `http://47.96.82.41:5188/rose/18/xgg.json` 的首个 JS 站点测试，实际 drpy 引擎和规则成功初始化并返回 7 个分类。其豆瓣旧 API 在不同请求中返回 403/404，未取得真实影片列表，不将占位数据计作成功。本记录是浏览器沙箱加原生 Java HTTP 验证，尚非 Android 真机 JS 执行验收。
- 随后在 PJE110 的 HBuilder 调试版实际页面中发现并修复启动请求拦截：Android `loadDataWithBaseURL` 会产生主文档 `data:` 请求，现交回 WebView 原生加载，仅代理 HTTP/HTTPS 模块。冷启动后的真实页面已显示 7 个分类，上游推荐仍返回 403；不再出现 `unknown protocol: data`。
- 另使用显式启动的 `tools/tvbox-spider-fixture.mjs`，在真实 App 页面验证 JS 分类、封面、搜索、详情、选集、带请求头的媒体代理和 LibVLC 视频画面，已通过。fixture 只提供项目自有的“夜航”演示视频，不进入生产流程；恢复了原配置及播放记录。
- “我要┃吃瓜”配置的实际 API 是 `.py`，需要 Python Spider；在 JS 接入之后已另行接入并验证其原生执行链，具体结果见 Python 文档。
- 截图中的 HTTP 资源接口在 Node 和 Java 请求中均复现连接重置；用户反馈偶尔成功，按间歇性连接问题处理，未认定永久失效。
- 后续在手机用第三方快看规则取得真实分类、片单和详情，所测播放条目需要网页嗅探；原配置 JAR 站点另已实际播放。引擎组合、上游失败及视频验收边界见 [2026-11-11 真实资源验证](android-spider-real-data-2026-11-11.md)。

源码和原生桥接组件已更新，已安装的旧资源不会仅因配置刷新而自动获得新执行器；需重新运行更新后的调试资源，或之后重新打包安装。

