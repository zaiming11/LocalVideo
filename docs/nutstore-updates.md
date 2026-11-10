# 坚果云应用更新

> 此方案已停用，以下保留为历史记录。当前应用更新与发布流程见 [GitHub 应用更新](github-updates.md)。

更新源使用已有的坚果云文件夹 **LocalClnema**，`C` 后是小写字母 `l`。实际路径已通过 WebDAV 查询确认。

版本管理文件：`https://dav.jianguoyun.com/dav/LocalClnema/version.json`。

## 当前清理状态（2026-11-09）

按用户要求清理旧产物后，`desktop/dist` 只保留 Windows 1.1.0-alpha.4、Android 1.0.3 及各自的 SHA-256 文件。旧安装包、blockmap、打包日志和 win-unpacked 已移到 `.backup/obsolete-builds-20261109-222427`，属于可恢复归档，未永久删除；永久删除被自动审批策略拦截，系统回收站操作也被拒绝。

云端删除了旧 Windows 1.1.0-alpha.2 的 29 个分片，以及未完成上传的 alpha.4 两个分片。删除前已撤下旧 Windows 更新条目，防止版本文件引用不存在的文件。当前云端仅有 `LocalVideo-1.0.1-Android.apk` 和 `version.json`，没有已发布的 Windows 更新。清理后重试新版 EXE 分片及 Android 1.0.3 仍返回 HTTP 403。`updates/version.json` 是待发布的新版本清单，上传恢复后重新 Publish 即可。

## 应用端

- 首次安装包含本功能的新版本：Windows 1.1.0-alpha.2 或 Android 1.0.1。之前没有更新功能的版本需要先手动安装一次。
- 设置 → 关于 → 应用更新 → 更新来源设置：版本文件地址已预填；填写能访问此文件夹的坚果云账号和第三方应用密码，点击“保存并记住密码”。这是第三方应用密码，不是坚果云网页登录密码。
- 每台设备首次配置一次，之后重启自动读取已保存凭据。界面显示密码已记住，不回显原密码；同一账号、同一地址下密码留空再保存会保留原密码，更换账号或地址则需重新填写。
- 本次开发使用的 Windows 电脑可以读取本机发布工具已保存的受保护凭据；凭据没有写入源码、安装包或云端版本文件。其他设备需要首次配置。
- Windows 使用系统 safeStorage / DPAPI 加密保存，Android 使用 Android Keystore 的 AES-GCM 加密保存。
- 应用启动后检查新版本，也可点击“检查更新”。发现版本后下载，校验成功再由用户确认安装。
- Windows 保存播放记录后打开安装器并退出；Android 打开系统安装界面，按系统提示完成安装。
- Android 会检查 APK 的包名、签名、实际 versionName/versionCode，拒绝无法覆盖当前应用的安装包。

也支持公开只读 HTTPS 更新地址：将账号、密码留空。公开分发不能把发布者的 WebDAV 写入凭据放进安装包。

## 版本文件

源文件位于 `updates/version.json`，包含两个独立平台条目：

- `schemaVersion`：固定为 1。
- `platforms.windows.version` / `platforms.android.version`：与各平台真实安装包版本一致。
- `file`：完整安装包文件名，使用 ASCII 字母、数字、点、横线或下划线。
- `size`：安装包字节数。
- `sha256`：完整安装包 SHA-256。
- Android 的 `versionCode`：与 APK 中的整数版本号一致，发布新版时递增。
- `notes`：更新说明。
- Windows 的 `chunks`：大包的有序分片列表，每片包含 file、size、sha256。

旧版 Windows 1.1.0-alpha.2 配套安卓环境安装器约 900 MiB，完整上传曾断开，因此发布工具使用 32 MiB 分片保存。1.1.0-alpha.3 起已移除安卓环境，安装包将明显缩小；仍可使用同一分片更新机制。应用自动按顺序下载合并，并校验每片和完整安装器，用户无需手工合并。

云端 `version.json` 只在全部安装包/分片上传并通过回读 SHA-256 校验后发布。上传失败时，版本文件保持原样，不会提示用户下载未完成版本。已成功上传的相同文件可在重试时校验后跳过。

## 发布下一版

1. 更新 Windows 的 desktop/package.json 版本，或 Android 的 manifest.json versionName/versionCode。
2. 构建新 EXE / APK。Android 保持原包名和签名证书。
3. 在项目根目录执行：

```powershell
node tools/prepare-updates.cjs "完整Windows安装包路径" "完整Android安装包路径"
```

脚本准备 desktop/.update-publish 下的安装包与分片，生成 updates/version.json 的大小和哈希。检查版本号及更新说明后执行：

```powershell
./tools/publish-nutstore.ps1 -Action Publish -Manifest ./updates/version.json -PackageDirectory ./desktop/.update-publish
```

完成后可读取云端版本文件：

```powershell
./tools/publish-nutstore.ps1 -Action ReadVersion
```

发布凭据保存在 `%LOCALAPPDATA%/LocalVideoPublisher/nutstore.json`，密码为当前 Windows 用户的 DPAPI 加密数据。此文件不在项目目录中，不可直接复制到另一用户/电脑使用。脚本仅允许凭据发送至坚果云官方 HTTPS WebDAV 域名；跨域下载重定向不会携带凭据。

需要重新配置发布账号时，可在 PowerShell 中使用 Read-Host 和 Read-Host -AsSecureString 读取账号及应用密码，以 ConvertFrom-SecureString 保存加密值。不要把密码写进命令文件、版本文件或 Git 仓库。

## 验证范围

2026-11-09 最新发布尝试：Windows 1.1.0-alpha.4 的前两个分片上传并回读校验成功，第三个分片连续两次被 WebDAV HTTP 403 拒绝；单独上传 Android 1.0.3 也返回 403。服务器未提供原因，标准 WebDAV 配额属性不受支持，不能据此认定空间或流量已用尽。云端版本文件未修改，回读仍为 Windows 1.1.0-alpha.2 / Android 1.0.1。`updates/version.json` 当前为待发布的新版本清单，解决云端写入问题后可重新执行 Publish，已校验文件会跳过。

2026-11-09 已完成云端发布：Windows 1.1.0-alpha.2（29 个分片）、Android 1.0.1，以及 version.json。所有安装包/分片均已从坚果云回读并比对 SHA-256；版本文件回读一致。打包后的 Windows 更新模块实际读取云端配置，确认旧版本能发现更新、相同版本不会再次提示。全部 65 项测试通过。

已验证版本比较（包括 1.10 / 1.2 和预发布版本）、路径限制、大小与 SHA-256、错误分片、安装前二次校验、凭据不返回界面，以及打包后版本解析模块和 Windows 系统加密。

Android 1.0.1 的包名为 uni.app.UNI8B2E700，versionCode 为 101，签名与 1.0.0 一致。系统最终安装仍由用户确认。Windows 1.1.0-alpha.3 起改为独立桌面版，只支持 PC 兼容源；上面的云端发布记录对应旧版，不代表新版本已上传。
