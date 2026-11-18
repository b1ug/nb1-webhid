import { requestBlink1Device } from './shared/transport.js';
import { initUI, renderStatus, rpc, showMessage, t, errorMessage } from './ui.js';

let state = null, working = false;
const choose = document.querySelector('#choose'), ownership = document.querySelector('#ownership');
function render() {
  renderStatus(state);
  choose.disabled = working || !ownership.checked || Boolean(state?.busy) || Boolean(state?.connected) || Boolean(state?.uncertain);
}
async function refresh() { state = await rpc({ op: 'status' }); render(); }
ownership.addEventListener('change', render);
choose.addEventListener('click', async () => {
  if (!ownership.checked || working) return;
  working = true; render(); showMessage(t('waiting'));
  try {
    const device = await requestBlink1Device(); // Before any awaited non-HID work.
    if (!device) { showMessage(t('noDevice')); return; }
    state = await rpc({ op: 'connect', otherControllersStopped: true });
    showMessage(t('connected'));
  } catch (error) { showMessage(errorMessage(error), true); }
  finally { working = false; try { await refresh(); } catch {} render(); }
});
document.querySelector('#refresh').addEventListener('click', () => refresh().catch(error => showMessage(error.message, true)));
document.querySelector('#disconnect').addEventListener('click', async () => {
  working = true; render();
  try { state = await rpc({ op: 'disconnect' }); showMessage(t('disconnected')); }
  catch (error) { showMessage(error.message, true); }
  finally { working = false; render(); }
});
await initUI(render);
await refresh().catch(error => showMessage(error.message, true));
