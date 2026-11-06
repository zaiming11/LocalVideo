# 本地影库 · Windows 桌面版

适用于 Windows 10/11 64 位，无需 HBuilderX、Node.js 或本地预览服务。

- **推荐安装版**：`dist/LocalVideo-1.0.1-Windows-x64-Setup.exe`。安装一次，以后从桌面快捷方式打开。不要每次打开安装包。
- **免安装绿色版**：`dist/LocalVideo-1.0.1-Windows-x64-Green.zip`。完整解压一次，运行其中的 `本地影库.exe`。需保留整个文件夹，不能单独复制 EXE。
- 本机打包后也可直接运行 `dist/win-unpacked/本地影库.exe`。

1.0.0 单文件便携版每次启动会解压整个 Electron 运行环境，退出后删除。现在默认生成的安装版和绿色版省掉了这一步，重复打开更快。原单文件形式仍可通过 `npm.cmd run pack:portable` 单独生成，其名称带 `Portable`，不推荐用于频繁打开。

第一次启动后使用“导入文件夹”或“选择视频文件”；支持拖拽导入和子文件夹。旧版片库和播放记录的存储位置保持不变。

视频直接读取原位置，不复制进程序。片库和播放进度保存在 Windows 用户目录下；移动或删除原视频后需要重新导入。视频编码支持取决于内置 Chromium 与设备解码能力。

## 重新生成

需要 Node.js 与 HBuilderX Vue 3 编译插件。默认插件目录为 `E:/HBuilderX/plugins`，可通过环境变量 `UNI_HBUILDERX_PLUGINS` 修改。

```powershell
cd G:\video-app\LocalVideo\desktop
npm.cmd ci
npm.cmd test
npm.cmd run pack
```

根目录的 `一键打包EXE.bat` 同样生成安装版与绿色版。打包完成后可运行 `npm.cmd run measure:startup`，测量“启动进程到窗口首帧可显示”的耗时；检查使用独立的临时片库，不影响个人数据。

`assets/icon.svg` 为统一图标源；`npm.cmd run icons` 同步生成 Windows 多尺寸 ICO、Android 六档密度 PNG、512px 预览及 `static/logo.png`。Android 路径已配置在项目 `manifest.json` 中，重新打包 APK 后生效。
