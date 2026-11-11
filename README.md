# 本地影库 · LocalVideo

一款用于整理和播放本地视频的应用，提供 Windows 桌面版与 Android 版。支持文件夹导入、媒体库浏览、自然排序、播放记录和进度续播。

## 下载安装

下载后即可安装或运行，无需准备 Node.js、HBuilderX 或开发环境。

| 平台 | GitHub 下载 | 加速镜像下载 | 版本 | 使用方式 |
| --- | --- | --- | --- | --- |
| Windows 10/11 · 64 位 | [安装版 EXE](https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.1.0-alpha.7-Windows-x64-Setup.exe) | [镜像下载 EXE](https://gh-proxy.com/https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.1.0-alpha.7-Windows-x64-Setup.exe) | 1.1.0-alpha.7 | 安装后从桌面或开始菜单打开 |
| Android 6.0 及以上 · ARM64 | [Android APK](https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.0.7-Android.apk) | [镜像下载 APK](https://gh-proxy.com/https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.0.7-Android.apk) | 1.0.7 | 在手机上打开 APK 并安装 |

[查看全部版本与更新说明](https://github.com/zaiming11/LocalVideo/releases) · [下载 SHA-256 校验文件](https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/SHA256SUMS.txt)

GitHub 无法访问时可尝试加速镜像。镜像由第三方提供，同步可能延迟；应用内支持自动加速、GitHub 直连和自定义镜像。Windows 当前为测试版，欢迎反馈使用问题。

请下载上表中的应用文件。GitHub 自动生成的 **Source code (zip / tar.gz)** 是源码包，不能直接安装。

## 开始使用

1. 打开应用，通过“导入文件夹”或“选择视频文件”添加视频；Windows 版也支持拖拽导入。
2. 在媒体库中切换网格或列表视图，按文件名、添加时间、时长或大小排序。
3. 点击视频开始播放，可调整倍速、切换全屏；再次打开时可继续上次的播放进度。
4. 在“文件夹”中按目录浏览，在“最近”中查看播放记录。

Android 版扫描手机视频时需要视频访问权限，也可以选择文件夹导入。Windows 版直接读取原视频位置，不会把视频复制到安装目录；移动或删除原文件后，需要重新导入。视频能否播放取决于平台与设备支持的编码格式。

## 从源码运行与打包

`feat/tvbox-integration` 分支的 Windows 版独立运行，无需安卓环境、模拟器或手机。支持 PC 兼容的 XML / JSON、Type 4 HTTP 接口及直播源；Android JAR / DEX 插件仅由安卓 App 执行。兼容性说明见 [TVBox 接入记录](docs/tvbox-compatibility.md)。上方下载链接仍为已发布的稳定版本。

项目使用 **Vue 3 + uni-app**，Windows 版通过 **Electron** 封装。

当前开发代码已接入 Android 与 Windows **LibVLC** 播放器，Windows 使用内置运行库并嵌入主窗口播放；浏览器预览保留 HTML5。原生依赖准备、打包说明和源码链接见 [LibVLC 接入说明](docs/libvlc.md)。

```text
components/    通用界面组件
core/          媒体库、播放状态与平台适配
pages/         首页与播放器页面
desktop/       Windows 桌面程序与打包配置
static/        图标与演示资源
tools/         检查脚本与测试
```

### Windows

需要 Node.js 22.12 或更高版本，以及安装了 uni-app Vue 3 编译插件的 HBuilderX。

```powershell
git clone https://github.com/zaiming11/LocalVideo.git
cd LocalVideo/desktop
npm.cmd ci
npm.cmd test
npm.cmd run pack
```

默认从 `E:/HBuilderX/plugins` 读取编译插件；安装位置不同时，在打包前设置：

```powershell
$env:UNI_HBUILDERX_PLUGINS = 'D:/HBuilderX/plugins'
```

也可以在项目根目录双击 `一键打包EXE.bat`。安装包输出到 `desktop/dist/`。详细说明见 [Windows 桌面版文档](desktop/README.md)。

### Android

使用 HBuilderX 打开项目，在 `manifest.json` 中检查应用信息和 Android 打包配置，通过 HBuilderX 的 App 打包功能生成 APK。正式发布时使用自己的应用签名配置。

## 问题反馈

应用更新使用 GitHub Releases，默认镜像优先、失败自动直连，无需配置账号或密码。安装包含新版更新功能的应用后，可在“设置 → 关于 → 应用更新”检查、下载并确认安装，也可开启启动时自动检查。旧客户端需先手动安装一次新版；后续发布流程见 [GitHub 更新说明](docs/github-updates.md)。

请在 [Issues](https://github.com/zaiming11/LocalVideo/issues) 中描述系统版本、应用版本、操作步骤和实际现象；播放问题可附上视频容器及编码信息。
