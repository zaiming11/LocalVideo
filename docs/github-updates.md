# GitHub 应用更新

发布约定：本项目的“提交代码，打包发布”必须同时完成 GitHub Release 和 Netlify 生产部署。当前客户端默认更新来源已改为 Netlify，GitHub 为可切换的备用渠道；Netlify 构建和部署步骤见 [Netlify 发布说明](netlify.md)。

Windows 与 Android 默认从 [zaiming11/LocalVideo Releases](https://github.com/zaiming11/LocalVideo/releases) 检查和下载安装包，不需要账号、密码或个人访问令牌。

版本清单地址：`https://github.com/zaiming11/LocalVideo/releases/latest/download/version.json`。

默认优先通过 `https://gh-proxy.com/` 加速获取清单及安装包，失败、返回错误内容或包校验不通过时重试 GitHub 直连。设置页可切换直连或填写自定义 HTTPS 镜像前缀（例如 `https://你的镜像域名/`，应用会在其后拼接完整 GitHub 地址）。公共镜像由第三方提供，可用性和缓存同步时间不受本项目控制；可以更换线路或改为直连。

## 应用使用

打开“设置 → 关于 → 应用更新”即可检查、下载和安装。默认启动时检查更新，可在设置中关闭。旧坚果云配置会自动迁移到 GitHub，保留自动检查偏好，移除旧账号密码。

下载按大小和 SHA-256 校验；Windows 在用户确认后保存播放记录、打开安装器并退出。Android 还核对 APK 包名、签名、实际版本号和 versionCode，由系统确认覆盖安装。GitHub 连接失败时可稍后重试。

切换更新服务需要重新安装包含本次修改的版本。已安装的旧客户端仍使用其原有更新逻辑，不能通过更改 GitHub 文件自动切换。

## 发布新版本

1. 先更新 Windows `desktop/package.json`、Android `manifest.json` 的版本并构建安装包。Android 继续使用原包名和签名；versionCode 必须递增。
   当前 Android 发布面向 ARM64。双架构 LibVLC 资源超过云打包免费项目体积限制时，可运行 `node tools/stage-android-release.cjs` 创建仅含运行资源和 ARM64 库的发布目录，用 `cli project open --path 目录` 导入，再通过 `cli pack --project 发布目录名称 ...` 云打包。当前 HBuilderX CLI 对完整路径的识别不可靠，使用已导入的项目名称并核对编译日志；原项目仍保留两种架构的开发资源。
2. 提交与安装包对应的源码，然后准备完整 EXE 和 APK。只发布安装版，不发布绿色版或分片：

```powershell
node tools/prepare-updates.cjs "Windows安装包完整路径" "Android安装包完整路径" --tag v1.2.0
```

脚本在 `desktop/.update-publish/` 准备完整安装包和 `version.json`，并同步 `updates/version.json`。不指定标签时使用 `v{Windows版本}-android-{Android版本}`。检查清单的版本和更新说明后执行：

```powershell
# 只核验文件，不联网发布
node tools/publish-github.cjs

# 创建草稿，上传并核验全部资源，最后公开发布
node tools/publish-github.cjs --publish --notes-file "更新说明.md"
```

发布工具使用本机 Git 登录凭据，或环境变量 `GH_TOKEN` / `GITHUB_TOKEN`。令牌只用于发布，不会写入应用、清单或安装包。默认关联远程 `main`，可通过 `--target 提交SHA` 指定对应源码提交。

上传失败会保留草稿，再次运行时跳过大小和 GitHub SHA-256 均一致的资源。已公开标签不允许覆盖，后续发布使用新标签。工具将 Release 标为最新的正式发布，以便 `/releases/latest/` 能找到；各平台实际版本由清单独立决定，清单可以保留测试版本号。

每次 Release 必须同时包含 `version.json` 和其中引用的全部安装包。下载地址使用 `/releases/download/固定标签/文件名`，即使发布了下一版，正在下载的客户端仍读取检查时的版本。不要把下载地址写为 `latest`，也不要删除仍被客户端使用的旧安装包。

现有 `updates/version.json` 若来自坚果云分片发布，需要在重新打包后运行准备脚本生成新清单。没有更新功能的早期版本需从 Release 页面手动安装一次。
