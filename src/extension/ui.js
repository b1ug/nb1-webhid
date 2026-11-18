const catalog = {
  en: {
    browserReminders: 'Browser reminders', littleSignal: 'A little signal, close by.', connectionPage: 'Connect a light', refresh: 'Refresh', reminderColor: 'Reminder color', colorInput: 'Name, hex or a ColorInput JSON object', colorHelp: 'Use red, #abc or the same rgb8 / hsv input as native nb1.', set: 'Set color', off: 'Off', timer: 'Timer', minutes: 'Minutes · 1–1440', startTimer: 'Start timer', cancelTimer: 'Cancel timer', timerHelp: 'You may close this popup. At the reminder, the light holds its color until Off. Alarms may be delayed.', lastEvent: 'Last event', disconnect: 'Disconnect', disconnectHelp: 'Disconnect closes the handle and cancels the timer. It does not turn the light off.', browserConnection: 'Browser connection', connectHeading: 'Choose the light beside you.', connectIntro: 'The extension talks directly to blink(1) through WebHID. You do not need the native nb1 client.', beforeConnecting: 'Before connecting', ownershipHelp: "Stop the native daemon and close other browser controllers of this light. WebHID does not participate in nb1's native ownership lock.", ownershipConfirm: 'I have stopped other controllers of this light.', chooseDevice: 'Choose blink(1)', permissionHelp: 'Only the blink(1) vendor/product is requested. Selection and opening send no color commands.', whatNext: 'Then use the toolbar', nextHelp: "Open nb1 from Chrome's toolbar to set a color, turn the light off or start a timer. Closing the popup does not close the background connection.", limits: 'This development preview supports exactly one granted blink(1). Browser restart, lost permission or unplugging requires explicit reconnection. No device storage is written.', browserBoundary: 'Chrome must keep running. A timer interrupted by a background restart is cancelled, not replayed later.', connected: 'Connected', disconnected: 'Not connected', uncertain: 'Device outcome unknown', pending: 'Waiting for browser I/O', noTimer: 'No timer scheduled.', timerDue: 'Reminder due around', waiting: 'Working…', noDevice: 'No light was selected.', commandSent: 'Command sent. This does not measure physical completion.', extensionOnly: 'Open this page from the loaded Chrome extension.', timeout: 'The browser is still responding. Refresh status before sending again; the previous outcome may be unknown.', language: 'Switch to Chinese', connectTitle: 'Connect · nb1',
  },
  'zh-CN': {
    browserReminders: '浏览器提醒', littleSignal: '让小灯，传递一个信号。', connectionPage: '连接小灯', refresh: '刷新', reminderColor: '提醒颜色', colorInput: '颜色名、Hex 或 ColorInput JSON 对象', colorHelp: '可用 red、#abc，或与本机 nb1 相同的 rgb8 / hsv 输入。', set: '设定颜色', off: '熄灭', timer: '倒计时', minutes: '分钟 · 1–1440', startTimer: '开始计时', cancelTimer: '取消计时', timerHelp: '可以关闭此弹窗。到时小灯保持提醒颜色，直到你选择熄灭。浏览器计时可能延后。', lastEvent: '最近事件', disconnect: '断开连接', disconnectHelp: '断开会关闭连接并取消计时，不会改变灯的最后颜色。', browserConnection: '浏览器连接', connectHeading: '选择身边的那盏灯。', connectIntro: '扩展通过 WebHID 直接与 blink(1) 通信，无需安装原生 nb1 客户端。', beforeConnecting: '连接之前', ownershipHelp: '先停止本机 daemon，并关闭控制同一盏灯的其他浏览器页面。WebHID 不参与 nb1 的原生设备锁。', ownershipConfirm: '我已经退出控制这盏灯的其他程序。', chooseDevice: '选择 blink(1)', permissionHelp: '仅请求 blink(1) 的厂商和产品。选择、打开设备不发送颜色命令。', whatNext: '然后使用工具栏', nextHelp: '从 Chrome 工具栏打开 nb1，可以设色、熄灭或开始倒计时。关闭弹窗不会关闭后台连接。', limits: '此开发预览只支持一只已授权的 blink(1)。浏览器重启、权限丢失或拔插后，需要明确重新连接。不会写入设备存储。', browserBoundary: 'Chrome 必须继续运行。后台重启中断的计时会被取消，不在之后自动补播。', connected: '已连接', disconnected: '未连接', uncertain: '设备结果未知', pending: '正在等待浏览器 I/O', noTimer: '尚无计时。', timerDue: '预计提醒时间', waiting: '处理中…', noDevice: '没有选择小灯。', commandSent: '命令已发送；这不代表测量了实际发光完成情况。', extensionOnly: '请从已加载的 Chrome 扩展中打开此页面。', timeout: '浏览器仍在响应。再次发送前先刷新状态；之前的结果可能未知。', language: '切换到英文', connectTitle: '连接 · nb1',
  },
};

let language = 'en';
export const t = key => catalog[language][key] || catalog.en[key] || key;
export const locale = () => language;
export const errorMessage = error => error?.code === 'open_failed'
  ? (language === 'zh-CN' ? '浏览器未能打开 blink(1)。请先停止同灯的 nb1 daemon 或断开其他控制器，再重新选择设备；若仍失败，再检查浏览器设备授权。本次没有发送灯光指令。' : 'The browser could not open blink(1). Stop the native nb1 daemon or disconnect other controllers for this light, then choose it again. If opening still fails, check the browser device permission. No light command was sent.')
  : error?.message || String(error);
// Preserve authored JSON so the shared Go parser sees duplicate fields,
// number spelling and Unicode escapes. Plain names/hex are JSON strings.
export const colorInputJSON = value => /^[\[{"]/.test(value.trim()) ? value.trim() : JSON.stringify(value.trim());

export async function initUI(render = () => {}) {
  let saved;
  try { saved = await globalThis.chrome?.storage?.local?.get('nb1-extension-locale'); }
  catch (error) { showMessage(error.message, true); }
  language = saved?.['nb1-extension-locale'] === 'zh-CN' ? 'zh-CN' : 'en';
  function apply() {
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
    const button = document.querySelector('#language');
    button.textContent = language === 'en' ? '中文' : 'EN'; button.setAttribute('aria-label', t('language'));
    document.title = document.body.classList.contains('options') ? t('connectTitle') : 'nb1';
    render();
  }
  document.querySelector('#language').addEventListener('click', async () => {
    language = language === 'en' ? 'zh-CN' : 'en';
    try { await globalThis.chrome?.storage?.local?.set({ 'nb1-extension-locale': language }); }
    catch (error) { showMessage(error.message, true); }
    apply();
  });
  apply();
}

export function showMessage(message = '', error = false) {
  const element = document.querySelector('#message');
  element.textContent = message; element.classList.toggle('error', error);
}

export async function rpc(message) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error(t('extensionOnly'));
  let timer;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(t('timeout'))), 15000); }),
    ]);
    if (!response?.ok) throw Object.assign(new Error(response?.error?.message || 'Unknown extension response.'), { code: response?.error?.code });
    return response.result;
  } finally { clearTimeout(timer); }
}

export function renderStatus(state) {
  const label = state?.uncertain ? 'uncertain' : state?.busy ? 'pending' : state?.connected ? 'connected' : 'disconnected';
  document.querySelector('#connection').textContent = t(label);
  document.querySelector('#device').textContent = state?.device ? `${state.device.productName} · ${state.device.vendorId.toString(16)}:${state.device.productId.toString(16)}` : '';
  document.querySelector('#last-event').textContent = state?.lastEvent ? JSON.stringify(state.lastEvent, null, 2) : '—';
  const disconnect = document.querySelector('#disconnect');
  disconnect.disabled = (!state?.device && !state?.uncertain) || Boolean(state?.busy);
  const timerState = document.querySelector('#timer-state');
  if (timerState) timerState.textContent = state?.timer ? `${t('timerDue')} ${new Intl.DateTimeFormat(language === 'zh-CN' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' }).format(state.timer.deadline)}` : t('noTimer');
}
