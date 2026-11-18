# nb1 浏览器工作台

**开发预览。**网页与源码独立于原生 nb1 的稳定发行。扩展为**实验版**，关闭弹窗后的实体灯提醒仍待独立验收。

本开发预览项目提供网页工作台与 Chrome 扩展，复用 nb1 的 Go 编译核心与播放计划。网页选择动作、调整相关参数后即可播放，预览为可选操作；扩展负责手动控制与浏览器内倒计时提醒，无需原生客户端。

网页默认采用 Nightlab 与本地 blink(1) 三维模型。**屏幕预览**按实际编译后的 Sequence 动画播放，不连接或写入设备；**设备播放**继续保留明确的所有权确认与连接步骤。`?view=faces` 可直接查看固定灯号的二维双面视图，无 WebGL 或上下文丢失时也保留备用视图。接入边界与软件检查见 [Nightlab 说明](docs/NIGHTLAB.md)。

常亮可在原有灯号控件中选择“两灯分别设色”，分别设置固定 LED 1／LED 2。一次操作编译为既有的两 Step Sequence，不新增 Action 类型，也不表示两次 USB 写入在物理上原子同步。切换动作会保留各自草稿。

如果收到的是扩展 ZIP，请先看[加载扩展](docs/DISTRIBUTION.zh-CN.md#加载扩展)。下面的构建命令需要源码 checkout，不能在生成的扩展目录中运行。

## 本地构建与使用

需要 Git、Python 3、Node 22.12+ 和 Go 1.27.4。首次构建会获取固定提交的公开 nb1 源码；运行资产、字体、JSON 编辑器都随包提供，不使用 CDN。

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run serve
```

打开 `http://127.0.0.1:4176/`。网页默认英文，可显式切换中文。页面提供扩展 ZIP：下载解压后，在桌面 Chrome 的 `chrome://extensions` 中开启开发者模式，通过“加载已解压的扩展程序”选择该目录。扩展需要 Chrome 117+，尚未上架商店。

扩展 manifest 版本 `0.1.0` 只是开发标识，不代表已经发行。交付时请保留 `dist/build.json` 中的源码与散列身份。授权前可先阅读[安装、校验、更新与移除](docs/DISTRIBUTION.zh-CN.md)、[本地数据与权限](docs/PRIVACY.zh-CN.md)及[支持证据表](docs/DISTRIBUTION.zh-CN.md#支持证据)。

请先停止正在使用同一只灯的 daemon 或其他控制器，再明确选择设备。浏览器不会遵守 nb1 的原生进程锁；设备授权与系统 USB 访问条件仍适用。

如果 Chrome 报 **Failed to open the device**，先检查谁在占用这只灯：停止原生 daemon，或断开另一个网页／扩展，再重新选择设备。勾选确认框只表示你已完成这一步，网页不能替你停止其他进程。如果仍然失败，再检查 Chrome 的设备授权。打开失败不会发送灯光指令，也不会自动重试。要切回原生 nb1，先断开浏览器控制器，再明确启动 daemon。

## 第一阶段范围

- 九种 Action、serial／interval 两种有限 Sequence 均可由网页播放。Play 自动完成 Go 校验、编译和播放计划，不必先点击 Preview；进度就近显示。
- 参数跟随当前动作：单色效果显示一个颜色，Alternate／Orbit 显示双色，Off／Rainbow 不显示颜色表单。JSON 收入高级编辑区，手动编辑或导入时保留原文，不被表单覆盖；导出也自动编译。
- Stop 取消后续调度，已发送的硬件渐变仍可能完成；Off 另外发送熄灯。页面隐藏时停止调度，返回后不自动续播。实际 USB 与定时误差不计入名义时长，正常播放结束不代表光学测量。
- 导出的 `{ "sequence": ... }` 文件可直接交给匹配的 API v1 nb1 使用；导入与导出不开始播放。
- 扩展支持明确连接、Set／Off、分钟级倒计时、取消与断开。到时设色后保持至用户熄灯，不自动补播错过的提醒，不自动重连。
- 扩展只申请 storage 与 alarms，不读取所有网页，不监听任意系统或 AI 任务，不写设备 Pattern 行、Flash 或上电效果。

`npm run build:ui` 可在 UI 修改后复用已构建编译器；`npm run test:compiler` 检查原生／WASM 结果一致性；`python3 scripts/build-compiler.py --pure-tests` 另执行原四个 Go 包的测试。

构建、模拟设备测试、实际 Chrome 上下文检查和真实 USB／光学验收分别记录。本仓库是开发版本，不等于正式发布或所有设备已验收。具体阶段见[开发计划](docs/PLAN.zh-CN.md)，共享源码边界见[编译器说明](docs/COMPILER.md)。

网页执行细节见[播放行为](docs/PLAYBACK.zh-CN.md)，Chrome 的安装与倒计时边界见[扩展说明](docs/EXTENSION.zh-CN.md)。
