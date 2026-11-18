import { initUI, renderStatus, rpc, colorInputJSON, showMessage, t } from './ui.js';

let state = null, working = false;
function render() {
  renderStatus(state);
  for (const id of ['set', 'off', 'start-timer']) document.querySelector('#' + id).disabled = working || !state?.connected || Boolean(state?.busy);
  document.querySelector('#cancel-timer').disabled = working || !state?.timer || Boolean(state?.busy);
  document.querySelector('#disconnect').disabled ||= working;
}
async function act(op, values = {}) {
  working = true; render(); showMessage(t('waiting'));
  try { state = await rpc({ op, ...values }); showMessage(['set', 'off'].includes(op) ? t('commandSent') : ''); }
  catch (error) {
    showMessage(error.message, true);
    // Status is read-only and never retries the previous operation.
    try { state = await rpc({ op: 'status' }); } catch {}
  } finally { working = false; render(); }
}
document.querySelector('#open-options').addEventListener('click', () => {
  if (!globalThis.chrome?.runtime?.openOptionsPage) { showMessage(t('extensionOnly'), true); return; }
  chrome.runtime.openOptionsPage().catch(error => showMessage(error.message, true));
});
document.querySelector('#refresh').addEventListener('click', () => act('status'));
document.querySelector('#set').addEventListener('click', () => { try { void act('set', { colorJSON: colorInputJSON(document.querySelector('#color').value) }); } catch (error) { showMessage(error.message, true); } });
document.querySelector('#off').addEventListener('click', () => act('off'));
document.querySelector('#start-timer').addEventListener('click', () => {
  try { void act('timer', { minutes: Number(document.querySelector('#minutes').value), colorJSON: colorInputJSON(document.querySelector('#color').value) }); }
  catch (error) { showMessage(error.message, true); }
});
document.querySelector('#cancel-timer').addEventListener('click', () => act('cancel-timer'));
document.querySelector('#disconnect').addEventListener('click', () => act('disconnect'));
await initUI(render);
state = await rpc({ op: 'status' }).catch(error => { showMessage(error.message, true); return null; });
render();
