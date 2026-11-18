# Chrome 伙伴扩展

[English](EXTENSION.md) · [安装与更新](DISTRIBUTION.zh-CN.md) · [隐私](PRIVACY.zh-CN.md)

Manifest V3 扩展通过 WebHID 操作 blink(1)，无需原生 nb1 客户端。当前开发阶段提供显式连接、Set／Off 与一个分钟级倒计时。所有可执行灯光指令经过共享 Go 编译器和网页同用的受限传输层。

它尚未上架 Chrome 商店。软件和假 HID 检查不代表真实 USB、光学、浏览器重启／睡眠／拔插已验收。

## 构建与加载

构建仓库后，在桌面 Chrome 的扩展页通过**加载已解压的扩展程序**选择 dist/extension/，或先解压网页提供的 ZIP。扩展后台 WebHID 需要 Chrome 117+。WASM、Go 运行时、字体、图标与脚本全部随包提供，无远程可执行代码或启动下载。

自动化检查应使用独立测试 profile，不加载到用户日常 profile，不选择真实设备，也不访问原生 daemon。完整校验、更新与移除步骤见[交付指南](DISTRIBUTION.zh-CN.md)。

## 连接

1. 停止同灯的其他控制器，包括原生 daemon 与直连 WebHID 网页。浏览器不参与原生 nb1 占用锁。
2. 从弹窗打开连接页，确认其他控制器已停止，再选择 **Choose blink(1)**。
3. Chrome 的设备提示只使用 blink(1) 厂商／产品过滤。连接页只授权，不打开设备；后台获取已授权设备再打开。
4. 回到工具栏弹窗设色、熄灯或创建倒计时。关闭弹窗不会主动关闭后台 HID 连接。

当前要求恰有一只已授权 blink(1)。多只匹配设备会报告歧义，不默认选第一只。WebHID 提供产品信息，没有通用 USB 序列号属性，本工具不伪造串号。打开句柄不发送颜色或存储指令。

open_failed 表示 Chrome 拒绝打开句柄。即便已经授权，原生 daemon 或另一个网页仍可能持有灯。停止或断开占用方，再明确重新选择；勾选确认不能释放其他进程句柄。仍失败时检查浏览器设备授权。失败不发灯光指令，不自动重试；切回原生 daemon 前先断开扩展。

## 倒计时行为

输入 1–1440 的整数分钟和 nb1 ColorInput。Go 会在安排提醒前解析颜色。创建提醒不发送 USB 指令，会替换之前的倒计时。

截止后，alarm 在发送前消费已保存计划，停止原生播放，再发送一次 Set。颜色保持至显式 Off。Off 只改变当前灯光，不取消未来提醒；取消请使用 **Cancel timer**。Disconnect 取消提醒、关闭句柄，但不改变最后颜色。

Chrome alarms 可能延迟，不能唤醒睡眠中的电脑；它们触发提醒，不给动画逐 Step 计时。后台会话重启会取消旧倒计时；到期时无可用连接则标为 missed。两种情况都不自动重连或补播。

## 失败与状态

受支持 Chrome 中的 HID 连接可让扩展 worker 保持运行，但浏览器退出、崩溃、授权变化或设备断开仍需恢复。当前需要显式重连，不承诺系统服务式常驻。

只接受来自本扩展自身页面的消息：

| 操作 | 输入 | 效果 |
| --- | --- | --- |
| status | 无 | 读取扩展缓存状态，不访问 USB |
| connect | otherControllersStopped: true | 获取并打开唯一已授权灯，不写颜色 |
| set | colorJSON: string | 将 ColorInput 原始 JSON 交给 Go，再编译、发送 Set |
| off | 无 | 编译并发送一个黑色目标 |
| timer | minutes、colorJSON | 解析、编译并保存提醒，再创建 alarm |
| cancel-timer | 无 | 清除当前 alarm 与计划 |
| disconnect | 无 | 取消倒计时并关闭句柄 |

未知操作、外部来源消息均拒绝，当前不开放网页或其他扩展提交请求。

写入结果为 command sent，不是 Job 终态或光学测量。未知写入从不重试，后续发送需显式断开／重连，丢失句柄时也一样。排队指令不能转移到替换设备。JavaScript 超时不能强制取消 Chrome HID 调用，等待期间缓存状态仍可响应。

## 权限

manifest 只有 storage 与 alarms，不需要 nativeMessaging、offscreen、notifications、tabs、全站点、键盘、录屏、历史、cookies 或 downloads。WebHID 使用独立的用户设备选择器，只开放受限停止与 RGB／渐变操作，不提供 Pattern RAM／Flash／上电效果写入。

默认英文，可显式切换中文；切换保留原始 ColorInput、状态记录和 API 标识。配置位于扩展本地存储，不会自动与本机文件库共享。具体保存数据与撤销步骤见[隐私说明](PRIVACY.zh-CN.md)。

## 本阶段之后

- 获取关闭弹窗、重启、睡眠、拔插／重连、撤销授权和控制器竞争的真实设备证据。
- 用户启用后再按需授权下载完成提醒。
- 来源白名单与受限消息的可信站点事件。
- 调度与设备归属验收后，再加入 Go 多 Step、Pattern 导入导出、优先级与勿扰时间。

参考：[Chrome 扩展 WebHID](https://developer.chrome.com/docs/extensions/how-to/web-platform/webhid)、[Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)、[扩展 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)。
