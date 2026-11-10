# TVBox 资源收录验证

仅把请求成功且可由应用解析的配置或仓库加入资源下拉。验证不下载/执行插件，也不保证子配置、直播或视频可播放。失败地址保留在本记录，不预置进下拉。用户手动复验后失败的已收录地址保留并标示新状态。

发现来源：[TVAPP](https://github.com/youhunwl/TVAPP)、[Qist](https://github.com/qist/tvbox)。使用应用相同请求与解析实现，UA 为 okhttp/3.12.13。时间为 UTC。

| 资源 | 配置地址 | 来源 | 验证结果 | 说明 | 验证时间 |
| --- | --- | --- | --- | --- | --- |
| 饭太硬 | http://www.饭太硬.net/tv | 用户提供 | 格式未通过 | 配置或接口数据不是有效 JSON/XML；可能已失效或需要专用解密插件 | 2026-11-09T09:49:04.982Z |
| 摸鱼儿 | http://www.y456y.com | 用户提供 | 配置有效 | 107 个站点（HTTP 0 / 插件 107） · 1 组直播（未验证播放） | 2026-11-09T09:49:14.818Z |
| 王二小 | http://new.王二小放牛娃.top | 用户提供 | 配置有效 | 100 个站点（HTTP 0 / 插件 100） · 2 组直播（未验证播放） | 2026-11-09T09:49:04.958Z |
| 肥猫 | http://肥猫.net/ | 用户提供 | 格式未通过 | 配置或接口数据不是有效 JSON/XML；可能已失效或需要专用解密插件 | 2026-11-09T09:49:06.814Z |
| 潇洒 | https://cnb.cool/fish2018/xs/-/git/raw/main/api.json | 用户提供 | 请求失败 | 接口返回 HTTP 403 | 2026-11-09T09:49:05.112Z |
| 小盒子4K | http://xhztv.top/4k.json | 用户提供 | 格式未通过 | 配置或接口数据不是有效 JSON/XML；可能已失效或需要专用解密插件 | 2026-11-09T09:49:07.155Z |
| 创享影视 | https://ys.cxkjg.cn/api/provide/tvbox | 用户提供 | 配置有效 | 12 个站点（HTTP 12 / 插件 0） | 2026-11-09T09:49:05.566Z |
| 影仓 | http://124.71.19.220/c/1 | 用户提供 | 配置有效 | 37 个站点（HTTP 2 / 插件 35） · 3 组直播（未验证播放） | 2026-11-09T09:49:05.702Z |
| 伦理接口 | http://47.96.82.41:5188/rose/18/xgg.json | 用户提供 | 配置有效 | 43 个站点（HTTP 10 / 插件 31） | 2026-11-09T09:49:05.843Z |
| 老刘备 | https://raw.liucn.cc/box/m.json | 用户提供 | 配置有效 | 234 个站点（HTTP 15 / 插件 219） · 3 组直播（未验证播放） | 2026-11-09T09:49:06.267Z |
| 小马 | https://szyyds.cn/tv/x.json | 用户提供 | 请求失败 | 请求超时，请稍后重试 | 2026-11-09T09:49:11.278Z |
| 小盒子单仓 | http://xhztv.top/xhz | 用户提供 | 配置有效 | 54 个站点（HTTP 0 / 插件 54） · 1 组直播（未验证播放） | 2026-11-09T09:49:08.221Z |
| 嗷呜 | http://itv666.cc/aowu/config.webp | 用户提供 | 格式未通过 | 配置或接口数据不是有效 JSON/XML；可能已失效或需要专用解密插件 | 2026-11-09T09:49:08.253Z |
| 小盒子多仓 | http://xhztv.top/dc | 用户提供 | 仓库有效 | 18 个仓库配置（子配置未逐一验证） | 2026-11-09T09:49:09.732Z |
| 拾光多仓 | http://xmbjm.fh4u.org/dc.txt | 用户提供 | 格式未通过 | 配置或接口数据不是有效 JSON/XML；可能已失效或需要专用解密插件 | 2026-11-09T09:49:09.870Z |
| 挺好分享多仓 | http://ztha.top/TVBox/GYCK.json | 用户提供 | 仓库有效 | 32 个仓库配置（子配置未逐一验证） | 2026-11-09T09:49:09.959Z |
| 王二小新接口 | https://9280.kstore.vip/newwex.json | 网上补充 | 配置有效 | 100 个站点（HTTP 0 / 插件 100） · 2 组直播（未验证播放） | 2026-11-09T09:49:09.974Z |
| 动漫城 | https://www.yingm.cc/dm/dm.json | 网上补充 | 配置有效 | 27 个站点（HTTP 0 / 插件 27） | 2026-11-09T09:49:10.088Z |
| 南风 | https://raw.githubusercontent.com/yoursmile66/TVBox/main/XC.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:09.978Z |
| 菜妮丝 | https://tv.菜妮丝.top | 网上补充 | 配置有效 | 37 个站点（HTTP 1 / 插件 36） | 2026-11-09T09:49:11.414Z |
| HG | https://api.hgyx.vip/hgyx.json | 网上补充 | 请求失败 | 请求超时 | 2026-11-09T09:49:35.088Z |
| 香雅情 | https://raw.githubusercontent.com/xyq254245/xyqonlinerule/main/XYQTVBox.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.279Z |
| 宝盒VIP | https://raw.githubusercontent.com/guot55/YGBH/main/vip2.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.280Z |
| 分享 | https://raw.githubusercontent.com/maoystv/6/main/000.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.280Z |
| 东篱线路 | https://raw.githubusercontent.com/chitue/dongliTV/main/api.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.280Z |
| 嗷呜新线路 | https://9763.kstore.vip/aowu.json | 网上补充 | 配置有效 | 80 个站点（HTTP 0 / 插件 80） · 6 组直播（未验证播放） | 2026-11-09T09:49:11.352Z |
| 游魂多仓 | https://www.iyouhun.com/tv/dc | 网上补充 | 仓库有效 | 24 个仓库配置（子配置未逐一验证） | 2026-11-09T09:49:11.486Z |
| 潇洒新线路 | https://9877.kstore.space/AnotherDS/api.json | 网上补充 | 请求失败 | 接口返回 HTTP 404 | 2026-11-09T09:49:11.572Z |
| Qist 电视合集 | https://raw.githubusercontent.com/qist/tvbox/master/jsm.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.486Z |
| Qist 潇洒 | https://raw.githubusercontent.com/qist/tvbox/master/xiaosa/api.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.487Z |
| Qist 饭太硬 | https://raw.githubusercontent.com/qist/tvbox/master/fty.json | 网上补充 | 请求失败 | 来源指向本机或内网地址；仅手动导入的本机配置可访问本机服务 | 2026-11-09T09:49:11.487Z |

## 2026-11-10 用户提供地址复核

本批 18 个地址新增 1 项：综合直播源（IPv4 TXT）。挺好分享已存在；M3U 的 419 个去重地址全部包含于 TXT 的 541 个去重地址中，保留 TXT 一项。直播只验证列表可读取和解析，未逐频道播放；其他地址本次未通过，不加入。

| 资源 | 地址 | 处理 | 本次结果 |
| --- | --- | --- | --- |
| 整挺好直播 | https://s2.pub/ZTHAIPTV21 | 未通过，不加入 | getaddrinfo ENOTFOUND s2.pub |
| 华影视直播 | https://download.kstore.space/download/4077/dzbzb.txt | 未通过，不加入 | 接口返回 HTTP 401 |
| 天浪直播 | https://gh-proxy.com/https://raw.githubusercontent.com/keluo8824-cell/tvbox/refs/heads/main/live.txt | 未通过，不加入 | 接口返回 HTTP 404 |
| 今日直播 | https://gh-proxy.com/https://raw.githubusercontent.com/keluo8824-cell/tvbox/refs/heads/main/live2.txt | 未通过，不加入 | 接口返回 HTTP 404 |
| 综合直播源 TXT | https://live.hacks.tools/tv/iptv4.txt | 新增到下拉 | 549 个列表条目（未验证播放） |
| 综合直播源 M3U | https://live.hacks.tools/tv/iptv4.m3u | 频道地址均包含于 TXT，不重复加入 | 423 个列表条目（未验证播放） |
| 月光宝盒直播 | https://agit.ai/guot54/ygbh/raw/branch/master/zB/zB.txt | 未通过，不加入 | 请求超时，请稍后重试 |
| 荷城茶秀 | http://rihou.cc:88/荷城茶秀 | 未通过，不加入 | getaddrinfo ENOTFOUND rihou.cc |
| 时光机直播 | https://www.bestpvp.site/tm/stable/live_stable.txt | 未通过，不加入 | 请求超时，请稍后重试 |
| 饭太硬 | http://www.饭太硬.com/tv/ | 未通过，不加入 | 请求超时，请稍后重试 |
| 春盈天下直播 | https://wds.ecsxs.com/230864.json | 未通过，不加入 | 没有找到 TVBox 站点、仓库或直播列表 |
| OK吊炸天 | http://ok321.top/tv | 未通过，不加入 | getaddrinfo ENOTFOUND ok321.top |
| 巧技 | http://cdn.qiaoji8.com/tvbox.json | 未通过，不加入 | getaddrinfo ENOTFOUND cdn.qiaoji8.com |
| 春盈天下 | https://盒子迷.top/春盈天下 | 未通过，不加入 | 接口返回 HTTP 404 |
| 肥猫 | http://肥猫.com | 未通过，不加入 | 请求超时，请稍后重试 |
| 欧歌多仓 | http://m.nxog.top/nxog/ou1.php?url=http://tv.nxog.top&b=欧歌 | 未通过，不加入 | 接口返回 HTTP 404 |
| 挺好分享 | http://ztha.top/TVBox/GYCK.json | 已存在，不重复加入 | 32 个仓库配置（子配置未逐一验证） |
| 毒盒多仓 | https://tv.youdu.fan:666/ | 未通过，不加入 | connect ECONNREFUSED 8.134.83.224:666 |
