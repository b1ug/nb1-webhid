# 安装与评审浏览器工具

[English](DISTRIBUTION.md) · [播放行为](PLAYBACK.zh-CN.md) · [扩展说明](EXTENSION.zh-CN.md) · [隐私](PRIVACY.zh-CN.md)

当前包是**实验开发候选**，不是 Chrome 商店发行版，也不代表硬件兼容性已正式验收。扩展 manifest 版本为 **0.1.0**。仅凭这个数字不能确定源码身份或硬件支持范围；请同时保留构建记录与校验值。

## 选择使用方式

| 方式 | 安装 | 运行周期 |
| --- | --- | --- |
| 浏览器工作台 | 在受支持的桌面 Chrome 中打开本地网页，不需要原生 nb1 或扩展。 | 播放 Sequence 时保持页面可见。 |
| Chrome 扩展 | 解压候选包，在 Chrome 开发者模式下加载目录。 | 后台负责 Set／Off 与一个倒计时，工具栏弹窗可以关闭。 |
| 原生 nb1 | 按独立版本的原生候选安装指南操作。 | 通过前台 server 或可选系统服务接入 CLI、HTTP、MCP 与 Agent。 |

三者分别持有设备。连接下一种方式前，请先停止或断开上一种。文档站本身不连接 USB。

## 从源码构建

使用 Git、Python 3、Node.js 22.12+，以及[编译器说明](COMPILER.md)指定的 Go 工具链。请使用经过审阅的固定提交；main 分支属于开发版本，不是稳定扩展发行。

~~~sh
git clone https://github.com/b1ug/nb1-browser-tools.git
cd nb1-browser-tools
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run serve
~~~

打开 http://127.0.0.1:4176/。服务器只监听回环地址，提供静态网页与下载文件；它不是原生 nb1 daemon，也不打开 USB。

首次编译器构建会获取固定的上游源码。运行时脚本、WASM、字体、图像和许可证均随包提供，无需 CDN。静态构建使用 Node 内置功能；`npm ci --ignore-scripts` 为开发检查准备固定依赖，包括 Playwright 浏览器验收。若要复现已评审快照，请在构建前检出交付方提供的完整源码提交；分支名和 manifest 版本都不是不可变身份。

## 检查交付包

构建产生：

- **dist/web/**：网页与本地运行资源。
- **dist/extension/**：可加载的 Manifest V3 扩展，根目录包含 manifest.json。
- **dist/web/extension-download/nb1-extension.zip**：内容根目录与扩展目录一致的 ZIP。
- **dist/build.json**：源码提交、source_dirty、固定 Go 来源、工具链与逐文件字节数／SHA-256。

扩展 ZIP 还包含 **BUILD-INFO.json**、双语 README 与完整 **docs/**，可离线查看安装、隐私和恢复说明。BUILD-INFO.json 记录源码、开发状态、manifest 版本与编译器记录，不自我散列，也不宣称对包签名。下载页提供实际 ZIP 的 SHA256SUMS。

分享前对构建运行 npm run check，优先使用 source_dirty 为 false 的干净快照。散列只能检查一致性，不是签名，也不能证明未知来源的下载安全。

拿到 ZIP 后，应与可信交付方通过独立渠道提供的 SHA-256 对照。macOS／Linux：

~~~sh
shasum -a 256 nb1-extension.zip
~~~

Windows PowerShell：

~~~powershell
Get-FileHash .\nb1-extension.zip -Algorithm SHA256
~~~

不要从文件名推断它已经公开发行。当前没有公开 Release 下载地址、商店条目、签名安装器、自动更新器，也没有浏览器专属的公开 Homebrew／Winget 包。

## 加载扩展

1. 解压 ZIP 到准备长期保留的目录。
2. 在桌面 Chrome 打开 chrome://extensions，开启**开发者模式**。
3. 选择**加载已解压的扩展程序**，选中含 manifest.json 的目录；解压若多套了一层文件夹，请选择内层。
4. 按需固定 nb1，打开弹窗，再进入连接页。
5. 停止控制同灯的 daemon、其他扩展或 WebHID 网页，勾选确认，再显式选择 blink(1)。
6. 回到弹窗设色、熄灯或启动倒计时。

设备选择仅过滤 blink(1)。浏览器的设备授权与 manifest 权限是两回事。授权成功不代表设备已经可以打开，已有控制器仍可能占用它。

## 更新与移除

解压加载的扩展不会自动更新。替换前先取消倒计时；需要灯暗下来时先 Off，再 Disconnect。校验新包后替换所选目录，并在 chrome://extensions 中点击**重新加载**，然后显式重连、重新创建倒计时。后台会话重启会消费旧倒计时状态，不补播。

尽量保持加载目录稳定。换目录可能成为另一次安装，具有独立授权与本地状态。需要回退时可保留已校验旧包，仍按断开、替换、重载、重连的步骤操作。

移除前先取消倒计时，按需 Off 并 Disconnect，再到 chrome://extensions 点击**移除**。移除扩展或关闭网页不能撤销已经被设备接受的设色。

Disconnect 关闭连接，但保留授权。撤销网页访问时，在 Chrome 中打开该来源的站点信息／站点设置，移除 HID 设备权限。扩展授权可通过移除扩展，或当前 Chrome 版本提供的设备权限入口撤销。不要通过申请键盘或辅助功能权限绕过 HID 打开失败。

## 支持证据

| 范围 | 当前证据与边界 |
| --- | --- |
| 网页编译与播放核心 | 原生／WASM 一致性、真实 Go 计划、取消和受限假 HID 执行已通过软件验证。 |
| 网页／MV3 界面 | 独立 Chromium 软件检查覆盖英中、宽窄屏、真实扩展消息和接入假 HID 的浏览器 alarms。QA 使用 Chromium 156；Chrome 117 是声明的 API 下限，并非另做过该版本验收。 |
| macOS 与 MK2 | 用户已确认释放原生占用后，浏览器连接成功。原始 Nightlab 之前版本已有受控 Mac/MK2 网页 WebHID 指令路径记录；当前干净快照的软件证据单独记录。扩展倒计时生命周期与当前快照真机资格仍待验，不改贴旧证据。 |
| Windows／Linux | 桌面 Chrome 提供 API 是前提；真实 USB 权限与本包行为仍需分别验证。Linux 可能需要由系统／设备配置提供范围受限的 hidraw 规则。 |
| MK3／其他代际 | 不声明已验收。设备 Pattern 内存、Flash 与上电效果不在本候选范围内。 |
| Safari／Firefox／移动浏览器 | 不作为本候选的 HID 直连交付目标。离线编辑、编译取决于实际浏览器环境，不承诺 USB。 |

Chrome 官方说明扩展后台 WebHID 从 [Chrome 117](https://developer.chrome.com/docs/extensions/how-to/web-platform/webhid) 起提供；设备权限与 Linux 访问条件见 [WebHID 指南](https://developer.chrome.com/docs/capabilities/hid)。平台有 API，与 nb1 硬件完成验收是不同结论。

反馈时请提供 build.json 中的源码提交、扩展版本、浏览器／OS 版本、已知型号／固件、使用入口、具体操作与错误。不要附带无关 profile 路径或私人任务内容。
