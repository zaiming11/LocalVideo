@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title 本地影库 - Windows EXE 打包

rem 如 HBuilderX 安装在其他位置，请修改下面的默认插件目录。
if not defined UNI_HBUILDERX_PLUGINS set "UNI_HBUILDERX_PLUGINS=E:\HBuilderX\plugins"

pushd "%~dp0desktop"
if errorlevel 1 goto project_missing

echo ========================================
echo   本地影库 - Windows 64 位快速启动版打包
echo ========================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 22.12 或更高版本。
    goto failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 npm.cmd，请检查 Node.js 安装和 PATH 环境变量。
    goto failed
)
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || major === 22 && minor >= 12 ? 0 : 1)"
if errorlevel 1 (
    echo [错误] Node.js 版本过低，需要 22.12 或更高版本。
    node --version
    goto failed
)
if not exist "%UNI_HBUILDERX_PLUGINS%\uniapp-cli-vite\node_modules\@dcloudio\vite-plugin-uni\bin\uni.js" (
    echo [错误] 找不到 HBuilderX 的 uni-app Vue 3 编译插件。
    echo 当前插件目录：%UNI_HBUILDERX_PLUGINS%
    echo 请安装对应插件，或编辑本 BAT 顶部的插件目录后重试。
    goto failed
)
if not exist "package-lock.json" (
    echo [错误] desktop 目录缺少 package-lock.json。
    goto failed
)

echo [1/3] 检查桌面打包依赖...
node -e "const fs=require('fs'); const p=require('./package.json'); for(const [name, version] of Object.entries({...p.devDependencies,...p.dependencies})){const f='node_modules/'+name+'/package.json'; if(!fs.existsSync(f) || JSON.parse(fs.readFileSync(f,'utf8')).version!==version) process.exit(1)}" >nul 2>&1
if errorlevel 1 goto install_dependencies
goto dependencies_ready

:install_dependencies
if /i "%~1"=="--check" (
    echo [提示] 依赖尚未安装或版本不一致。正常双击运行时将自动安装。
    goto failed
)
echo 正在安装依赖，首次运行需要联网，请稍候...
call npm.cmd ci
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查上方日志和网络连接。
    goto failed
)

:dependencies_ready
if /i "%~1"=="--check" goto checked
echo.
echo [2/3] 生成统一图标、编译页面并封装独立 Windows 安装版（无需安卓环境）...
echo 请关闭正在运行的“本地影库”，避免文件占用导致打包失败。
echo 打包可能需要几分钟，请勿关闭此窗口。
echo.
call npm.cmd run pack
if errorlevel 1 (
    echo.
    echo [错误] 打包失败，请查看上方错误信息。
    goto failed
)
if not exist "dist\LocalVideo-*-Windows-x64-Setup.exe" (
    echo [错误] 命令已结束，但未找到预期的安装版 EXE。
    goto failed
)
echo.
echo [3/3] 打包成功！
echo 成品目录：%CD%\dist
echo 推荐：运行 Setup.exe 安装一次，以后从桌面快捷方式打开。
echo Windows 版独立运行，无需安装安卓环境或连接手机。
start "" explorer.exe "%CD%\dist"
goto succeeded

:checked
echo.
echo [通过] Node.js、HBuilderX 编译插件和桌面依赖均已就绪。
echo 本次仅检查环境，没有执行打包。

:succeeded
popd
if /i not "%~1"=="--check" pause
exit /b 0

:failed
popd
if /i not "%~1"=="--check" pause
exit /b 1

:project_missing
echo [错误] 找不到 desktop 目录，请将本 BAT 放在 LocalVideo 项目根目录。
if /i not "%~1"=="--check" pause
exit /b 1
