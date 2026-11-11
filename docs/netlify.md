# Netlify 网页部署

## 发布约定

用户要求“提交代码，打包发布”时，默认同时完成 GitHub Release 和本 Netlify 站点的生产发布。两端安装包、网页、版本清单都需同步到本次版本，不能只发布 GitHub 后把 Netlify 留待以后处理。保留现有站点绑定、访问设置及团队配置，不创建或升级收费资源。

发布按“打包、整理发布文件、直接发布”执行，不额外安排测试、启动检查或逐项验收。整理时生成更新必需的版本、文件大小与哈希；Netlify 发布目录只包含本次清单引用的安装文件和分片，不额外保留上一版。

本项目可将 H5 页面和 TVBox HTTP 代理一起部署到 Netlify。Netlify 版本使用浏览器播放器；CSP/JAR、JS、Python Spider 和原生 LibVLC 仍按各平台能力使用，不在云端执行。

2026-11-11 已发布到公开站点 https://localcinema-zaiming11.netlify.app ，团队 `zaiming11`，项目 ID `e689e3e5-508c-40da-a3ef-cf4a189a6538`。双更新渠道初次接入的生产部署 ID 为 `6af41165e98d4f00548e6024`；首次网页部署 ID 为 `6af40c45c11c391773a40208`。按用户确认将此站点从团队默认的私有访问改为公开访问，团队默认设置未改动。

未登录请求实测：主页 HTTP 200；TVBox 云端接口读取综合直播源 HTTP 200，解析 555 个频道；媒体代理返回 HTTP 206、`Content-Range: bytes 0-31/335291` 及正确的 32 字节内容；HEAD 返回同一范围、空响应体。6 项适配与网络检查通过。本记录不代表所有直播频道或第三方影片均已逐个播放。

## 本地构建与发布

使用 Node.js 22.13+，本机需要已安装的 HBuilderX Vue 3 编译插件。默认插件路径为 `E:/HBuilderX/plugins`，其他位置通过 `UNI_HBUILDERX_PLUGINS` 指定。

```powershell
node tools/build-netlify.cjs
netlify login
netlify deploy --site e689e3e5-508c-40da-a3ef-cf4a189a6538 --no-build --prod
```

`netlify.toml` 指定发布目录 `unpackage/dist/netlify`、函数目录和路由。构建脚本每次只清理此生成目录，排除 Android/VLC 原生资源；Netlify 构建专用插件将本机预览片单替换为空列表。本地开发和桌面构建仍沿用原来的配置。

## Windows / Android 应用更新

两端默认从 `https://localcinema-zaiming11.netlify.app/updates/version.json` 检查更新，设置内可切换回 GitHub Releases。GitHub 原有的自动加速、直连和自定义镜像继续保留。Netlify 走站点直连，不经 GitHub 镜像。切换来源会清除当前检查/下载结果，保留自动检查偏好。

`updates/version.json` 继续作为已发布安装包的原始记录，GitHub 发布流程不变。`node tools/prepare-netlify-updates.cjs` 校验 `desktop/.update-publish/` 内对应文件的大小和 SHA-256，生成 `updates/netlify-version.json` 及忽略的 `desktop/.netlify-updates/`，不修改安装包版本或内容。大于 32 MiB 的 Windows 安装包分为固定 32 MiB 块；Windows 更新器按清单顺序合并，再校验完整安装包。Android 保持完整 APK，安装前继续检查包名、实际版本和签名。

`tools/build-netlify.cjs` 会自动执行此准备步骤，并将当前清单及对应文件复制到发布目录的 `updates/`。因此在新电脑上部署时，需要先准备与原始版本记录匹配的安装包；缺失或哈希不符会阻止构建完成，避免发布不完整清单。版本清单设置为不缓存，安装包使用带版本号的文件名。

初次接入时仅同步了已有 Windows `1.1.0-alpha.7`、Android `1.0.7`，当时的二进制不包含双更新来源界面。当前发布流程已提高版本并重新打包；包含新代码的安装包默认使用 Netlify，并可切换 GitHub。旧客户端不会因网页发布而自动获得新代码，需先覆盖安装新版。

下次发布包含双渠道功能的安装包时，应先提高 Windows 的 `desktop/package.json` 版本、Android 的 `manifest.json` 版本与 `versionCode`，完成两端打包，再用 `tools/prepare-updates.cjs` 生成真实安装包记录，然后运行 Netlify 构建/部署。不要仅提高线上清单版本而继续指向旧二进制。

2026-11-11 验证：18 项更新、迁移、安全边界和发布准备检查通过，Windows/H5、Android 前端和生产 DEX 编译通过。使用实际 `AppUpdate` 从公开 Netlify 清单读到 Windows 版本，下载 5 个分片并合并成 162,899,130 字节安装包，完整 SHA-256 校验通过；APK 从 Netlify 实际下载 47,174,028 字节，SHA-256 同样通过。手机独立 `app_process` 加载相同生产 DEX，原生 `UpdateAgent` 读取线上清单并取得 HTTP 200 APK 响应，检查大小与 APK ZIP 头；未安装 APK、未操作手机页面、未改写已安装 App 数据。另通过实际 Windows 更新器检查 GitHub 渠道成功返回 `1.1.0-alpha.7`。这些下载检查未触发安装器。

## 云端接口

- `/__tvbox/request`：读取公共 HTTP/HTTPS 配置和影视接口，保留已有请求头规则、重定向和短暂断线重试。
- `/__tvbox/media/*`：转发封面及媒体，保留 Range/HEAD、HLS 分片与密钥重写，并返回流式响应。
- 云端始终禁止访问本机和内网；不接受来自其他网站的浏览器请求。配置、播放记录、用户导入内容和解锁状态仍只保存在访问者自己的浏览器中。

Netlify Functions 的运行时长、响应体大小和站点带宽额度仍适用。长视频与直播的实际可播性还取决于源站和浏览器解码能力；配置有效性检查不等于所有频道能播放。

验证：`node --test tools/netlify.test.mjs desktop/test/tvbox-network-retry.test.cjs desktop/test/tvbox-playlist-range.test.cjs`。

## 本轮安装包发布（2026-11-11）

Windows `1.1.0-alpha.8` 与 Android `1.0.8 / 108` 已重新打包，默认更新来源为 Netlify，GitHub 可切换使用。Netlify 生产部署 ID：`6af41b97a40b3d0a818041ad`，站点为 `https://localcinema-zaiming11.netlify.app`。本轮只发布当前版本的安装文件和分片，发布完成后未额外安排测试或验收。
