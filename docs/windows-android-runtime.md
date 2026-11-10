# Windows 配套安卓环境测试版

> 历史记录：2026-11-09 已按最新要求停用本方案。Windows 1.1.0-alpha.3 起独立运行，不再打包或调用安卓环境。下文仅记录旧版本试验，不适用于当前版本；请使用 README 中的 Windows 打包步骤。

版本：1.1.0-alpha.1。2026-11-09。

本版采用 **Windows 桌面界面 + 同一台电脑上的夜神安卓环境 + LocalVideo 专用引擎 APK**。不依赖安卓手机或局域网中的其他设备。HTTP 接口和本地视频继续由桌面端处理，CSP/JAR 插件转给本机安卓引擎。

## 安装与使用

1. 安装 `LocalVideo-1.1.0-alpha.1-Windows-x64-Setup.exe`。
2. 在设置 → TVBox 配置 → Windows 本机安卓环境中检查状态。
3. 没有安装安卓环境时，点击“安装配套安卓环境”。应用打开随包提供的官方完整安装器，由用户选择安装位置、确认官方协议；不会静默代为接受协议。
4. 已安装夜神时会自动检测，也可用“选择已安装目录”指定其安装目录或 bin 目录。安装完成后刷新状态。
5. 启动安卓引擎，导入配置，然后回到 TVBox 首页。首次访问 Android 插件站点时也会按需启动引擎。
6. 插件需要网盘登录或其他交互时，点击“打开安卓窗口”。停止引擎会中断依赖它的在线播放。

建议 Windows 10/11 64 位、8 GB 以上内存，并预留至少 8 GB 安装空间。请在 BIOS 启用 Intel VT-x / AMD-V。软件回退模式并非稳定播放的保证。

配套安装器是官方签名的 NoxPlayer 7.0.6.2 原始文件，829,357,816 字节。它只在安装时运行，正常打开桌面应用不会重复解压或运行这个安装器。夜神是单独安装的第三方软件，卸载 LocalVideo 不会删除用户的夜神实例。

- 官方来源：https://www.bignox.com/en/download/fullPackage/win_64_9?beta （当日重定向至 7.0.6.2 通用完整安装器）
- 原文件 SHA-256：`ac1440ec51dadf94eac813fb4f21c28bdeadf800edda7069063008048ca3983b`
- 数字签名校验：Valid，签名者 Nox Limited。
- 官方协议：https://www.yeshen.com/useragreement
- 官方隐私说明：https://www.bignox.com/privacy

## 本机实测与未完成事项

测试机器：Windows 10 22H2、i5-9500、32 GB 内存。硬件虚拟化检测为关闭。现有夜神实例为 Android 7.1 / API 25，支持 ARM native bridge。

已通过：

- 独立引擎 APK 的安装、启动、带会话令牌的健康检查及桌面请求转发。
- 通过宿主内置的原创 ARM ABI 标记库使模拟器按 armeabi-v7a 运行，摸鱼儿 FishGuard-v7 原生库加载成功。
- `http://www.y456y.com` 的片单精选在 Windows 本机实际返回 11 个分类以及真实影片列表。
- 经安卓引擎转发本地测试素材：MP4 Range 返回 206、32 字节；HLS 清单及分片返回 200。
- 59 项回归测试通过，Windows NSIS 配套安装包生成成功。
- 打包后的 EXE 启动检查通过：首次 7.79 秒，第二次 0.61 秒到 ready-to-show；此数字不包含后续安卓环境冷启动或插件加载时间。

**尚未通过稳定播放验收：**摸鱼儿随后启动的 `pvideo-stable-x86` 后台程序出现 SIGSEGV，ARM 回退程序也退出，最终引擎进程终止。当前环境未开启 VT；这是一项相关环境限制，尚不能断言是唯一原因。需要开启 VT 并重启后继续验证，也可能需要更新安卓实例或插件。不能将当前测试版描述为所有插件完整兼容。

桌面自动操作尝试被系统以 GetCursorPos / Access denied 拒绝，因此本轮没有完成桌面窗口操作的视觉验收。引擎与媒体转发测试使用同一台 Windows 上的本机安卓连接，未借助手机完成。

本轮没有重新安装夜神、接受其新协议、修改 BIOS、关闭系统安全功能或自动重启电脑。未上传或发布测试安装包到 GitHub。

## 构建与维护

在 desktop 目录执行 `npm ci`。构建引擎需要 JDK，可用 `JAVA_HOME` 指定；终端用户不需要安装 Java。

- `npm run build:android-host`：编译独立引擎 APK。首次会下载 Android SDK、R8、aapt2、Zig 编译器及 Maven 依赖。构建缓存保存在 tools/.android-build。
- `npm run prepare:runtime`：下载/校验固定版本的官方安装器，检查 APK，生成运行环境清单和许可证目录。
- `npm run pack`：生成 Windows 安装版 EXE，内含运行环境安装器、引擎 APK 和依赖声明。

本测试版 APK 使用本机开发签名。正式发布需通过 `LOCALVIDEO_ANDROID_KEYSTORE`、`LOCALVIDEO_ANDROID_STOREPASS` 指定自己的签名文件，别名为 localvideo，然后重新构建 APK 和安装包。

运行环境大文件在 desktop/.android-runtime 中，已加入 Git 忽略。源码中的固定版本、校验信息和构建脚本用于重建，不能只拉取源码后漏掉配套资源直接发布。当前构建输出仍是测试版，须在满足虚拟化条件的机器完成实际插件播放与安装流程验收后再发布。

ADB 使用独立本机端口 5041，插件操作始终指定从夜神配置读取的 127.0.0.1 实例；不会自动选择 USB 手机。应用只移除自己创建的转发，不使用 kill-server、quitall 或关闭用户其他安卓实例。Windows 退出时停止自己的引擎 APK，保留已安装的安卓环境。
