# LibVLC 播放器接入

当前开发代码已将 Android 与 Windows 播放切换为 LibVLC。浏览器预览仍使用 HTML5 / Hls.js。已发布的旧安装包不受源码修改影响。

## 播放方式

- Android：在当前播放页嵌入 LibVLC TextureView，普通模式和全屏均支持横向滑动快进／后退，滑动时预览、松手后跳转。视频内操作栏采用深色渐变、荧光黄播放键／进度条及 ±10 秒按钮，支持单击显隐和播放时无操作自动隐藏。保留横屏全屏、竖屏全屏、锁屏滑动解锁及全屏音量／亮度手势。全屏只调整布局，不重建播放实例。锁定后进度可见但不能操作，随操作栏一起自动隐藏。普通页面下方也可拖动进度；直播显示直播状态，不将分片窗口时长视为影片总时长。
- Windows：独立的原生播放窗口和透明控制层；解码调用在工作线程中执行。支持进度、倍速、上一集／下一集、音量／亮度、全屏、锁定与滑动解锁。关闭播放窗口后可从应用播放页重新打开。无需安装 VLC、安卓环境或连接手机。Windows 全屏使用显示器当前方向；横屏／竖屏按钮不会旋转 Windows 桌面。
- 本地视频直接交给原生库读取路径或 Android 文件描述符，避免复制大文件。TVBox 仍使用原解析流程；Windows 的私有回环代理保留请求头并改写 HLS 分片地址。
- 两个平台优先硬件解码，无法使用时由 LibVLC 回退。实际流畅程度仍受视频码率、设备解码能力和网络／存储速度影响。

## 开发依赖

在项目根目录执行：

```powershell
cd desktop
npm.cmd ci
cd ..
node --use-system-ca tools/prepare-vlc.cjs
node tools/build-vlc-android.cjs
```

依赖版本和下载校验值位于 `native/vlc/dependencies.json`。下载内容放在被 Git 忽略的缓存／运行库目录，不把视频解码库写入源码仓库。准备脚本校验官方摘要并核对已固定的 SHA-256。

Android 组件编译需要 JDK 及 `tools/.android-build/android35.jar`、`r8.jar`（项目现有 `tools/build-tvbox-android.cjs` 可准备 SDK 编译依赖）。修改 Java 源码后必须重新执行 `build-vlc-android.cjs`，它生成 DEX JAR 和 `core/vlc-native-version.js`。HBuilderX 将 `static/vlc-native/` 中的组件与 ARM64／ARMv7 库随 App 资源打包；首次播放按进程架构复制到 App 私有目录后加载。当前不含 x86 模拟器库。

Windows 的 `npm.cmd run pack`、`pack:dir` 会先准备内置 x64 LibVLC，随后复制到安装目录的 `resources/vlc-runtime/`。Koffi 是生产依赖，原生模块配置为从 ASAR 解包。运行库在首次播放时加载，不参与应用首页启动。`npm.cmd run build:web` 只编译网页，不包含原生运行库。

2026-11-10 已在连接的 Android 真机（PJE110）使用 HBuilder 调试版验证 TVBox 视频播放、续播、进度拖动、普通模式滑动快进和后退、全屏滑动快进、横／竖屏全屏、退出恢复竖屏、锁屏进度禁用及滑动解锁、音量和亮度手势，并查看了普通模式新版操作栏及显隐效果。本轮未生成或发布安装包，Windows 原生窗口尚未做运行验证；未将这些结果视为超大文件长时间性能测试。

真机测试同时修复了两处布局问题：组件早于页面显示时，播放器曾挂到预加载 WebView 下方；MediaCodec 直接渲染时可能缺少画面布局回调，现始终更新输出窗口尺寸并以实际视频轨道尺寸补充画面比例。这些尺寸只用于显示缩放，不自动改变用户选择的屏幕方向。

另修复 TVBox 后台插件调用 `Spider.safeDns()` 时因宿主缺少对应 API 导致的进程崩溃，补充了返回 `okhttp3.Dns` 的标准接口，使用系统 DNS；Android 桥接编译同步加入对应依赖。

## 第三方组件

- LibVLC Android 3.7.7：[官方 Android 组件源码](https://code.videolan.org/videolan/libvlcjni)、[Maven 制品](https://repo.maven.apache.org/maven2/org/videolan/android/libvlc-all/3.7.7/)。LibVLC Android 以 LGPL-2.1-or-later 发布。附带的 AndroidX Java 支持库使用 Apache-2.0 许可，版本和校验值一并固定。
- Windows LibVLC 3.0.24：[官方分发目录](https://download.videolan.org/pub/videolan/vlc/3.0.24/)、[对应源代码](https://download.videolan.org/pub/videolan/vlc/3.0.24/vlc-3.0.24.tar.xz)。LibVLC／libvlccore 使用 LGPL；官方发行包的部分插件使用 GPL 等许可，保留发行包中的 COPYING 与版权文件。
- Koffi 3.3.7：[源码与 MIT 许可证](https://github.com/Koromix/koffi)。

原生库以独立动态库加载，可从上述源码重新编译替换。分发应用时需随附相应许可证和源码获取说明，保留第三方版权声明。
