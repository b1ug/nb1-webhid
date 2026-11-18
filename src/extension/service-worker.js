import { createController } from './shared/extension-controller.js';
import { callCompiler } from './shared/compiler-loader.js';

const controller = createController({
  chrome, hid: globalThis.navigator?.hid,
  resolveColor: raw => callCompiler('resolveColor', raw),
  compile: action => callCompiler('compileAction', JSON.stringify(action)),
});

// Register listeners synchronously. Compilation and device access remain lazy.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
    sendResponse({ ok: false, error: { code: 'forbidden', message: 'Only this extension can submit controls.' } });
    return false;
  }
  controller.dispatch(message).then(result => sendResponse({ ok: true, result }), error => sendResponse({ ok: false, error: { code: error.code || 'operation_failed', message: error.message } }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { void controller.onAlarm(alarm).catch(error => console.error('Reminder failed:', error.code || 'operation_failed')); });
chrome.runtime.onStartup.addListener(() => { void controller.initialize().catch(error => console.error('State unavailable:', error.message)); });
chrome.runtime.onInstalled.addListener(() => { void controller.initialize().catch(error => console.error('State unavailable:', error.message)); });
