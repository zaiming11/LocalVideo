# 本地影库 · Windows 1.1.0-alpha.7 / Android 1.0.7

- 修复安卓检查更新解析版本清单时依赖全局 `URL` 接口的兼容问题，改用随应用提供的兼容实现。
- 保留版本比较、下载地址限制、文件大小和 SHA-256 校验，以及 Android 包名和签名校验。
- 继续提供自动镜像、GitHub 直连和自定义镜像。Netlify 尚未配置，本次安装包及更新清单仍发布在 GitHub。

## 下载与安装

| 平台 | GitHub 下载 | 加速镜像 |
| --- | --- | --- |
| Windows 10/11 x64 | [安装版 EXE](https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.1.0-alpha.7-Windows-x64-Setup.exe) | [镜像 EXE](https://gh-proxy.com/https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.1.0-alpha.7-Windows-x64-Setup.exe) |
| Android 6.0+ ARM64 | [APK](https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.0.7-Android.apk) | [镜像 APK](https://gh-proxy.com/https://github.com/zaiming11/LocalVideo/releases/download/v1.1.0-alpha.7-android-1.0.7/LocalVideo-1.0.7-Android.apk) |

Android 旧版若无法检查更新，请先手动下载本版 APK 覆盖安装。包名和签名沿用旧版，覆盖安装保留数据。Windows 当前为测试版。

本次客户端兼容修复不改变外部下载服务的带宽与可达性；公共镜像仍可能缓慢或超时。校验值见本 Release 的 `SHA256SUMS.txt`。GitHub 自动生成的 Source code 为源码包，安装请使用 EXE / APK。
