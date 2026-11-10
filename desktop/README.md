# 本地影库 · Windows 桌面版

适用于 Windows 10/11 64 位，无需 HBuilderX、Node.js 或本地预览服务。当前开发版 1.1.0-alpha.3 也无需安卓环境、模拟器或手机；TVBox 使用 PC 兼容的 HTTP 接口和直播源，Android JAR / DEX 插件仅限安卓 App。

直接下载：[安装版 EXE](https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.5-android-1.0.5/LocalVideo-1.1.0-alpha.5-Windows-x64-Setup.exe) · [全部版本](https://github.com/zaiming11/LocalVideo/releases)。Android 下载与项目介绍见 [项目首页](../README.md)。

- **推荐安装版**：`dist/LocalVideo-1.1.0-alpha.5-Windows-x64-Setup.exe`。安装一次，以后从桌面快捷方式打开。不要每次打开安装包。
- 本机打包后也可直接运行 `dist/win-unpacked/本地影库.exe`。

1.0.0 单文件便携版每次启动会解压整个 Electron 运行环境，退出后删除。现在发布的安装版省掉了这一步，重复打开更快。

第一次启动后使用“导入文件夹”或“选择视频文件”；支持拖拽导入和子文件夹。旧版片库和播放记录的存储位置保持不变。

视频直接读取原位置，不复制进程序。片库和播放进度保存在 Windows 用户目录下；移动或删除原视频后需要重新导入。当前开发代码使用随程序携带的 LibVLC 原生播放窗口，解码在独立工作线程运行，无需另装 VLC。浏览器预览仍使用 HTML5；两端播放器与依赖准备说明见 [LibVLC 接入](../docs/libvlc.md)。

## 重新生成

需要 Node.js 与 HBuilderX Vue 3 编译插件。默认插件目录为 `E:/HBuilderX/plugins`，可通过环境变量 `UNI_HBUILDERX_PLUGINS` 修改。

```powershell
cd LocalVideo/desktop
npm.cmd ci
npm.cmd test
npm.cmd run pack
```

根目录的 `一键打包EXE.bat` 同样可用于打包。对外发布使用 `Setup.exe` 安装包。打包完成后可运行 `npm.cmd run measure:startup`，测量“启动进程到窗口首帧可显示”的耗时；检查使用独立的临时片库，不影响个人数据。

`assets/icon.svg` 为统一图标源；`npm.cmd run icons` 同步生成 Windows 多尺寸 ICO、Android 六档密度 PNG、512px 预览及 `static/logo.png`。Android 路径已配置在项目 `manifest.json` 中，重新打包 APK 后生效。

应用内更新支持自动加速、GitHub 直连和自定义 HTTPS 镜像。自动模式优先使用 gh-proxy.com，连接或校验失败时重试 GitHub。镜像下载的安装包仍需通过大小和 SHA-256 校验。
