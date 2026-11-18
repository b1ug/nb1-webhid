import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Blink1WebHID, requestBlink1Device } from '../src/shared/transport.js';
import { canSendPreview, sendPreview } from '../src/shared/commands.js';

const device = () => ({ vendorId: 0x27b8, productId: 0x01ed, productName: 'blink(1)', opened: false, async open() { this.opened = true; }, async close() { this.opened = false; } });
const preview = () => ({ sequence: { timing: 'serial', repeat: 1, on_finish: 'hold', steps: [{ targets: [{ led: 0, color: '#aabbcc' }], fade_ms: 1000, hold_ms: 0 }] } });

test('extension-page chooser grants without opening or sending', async () => {
  const d = device(); let filter;
  assert.equal(await requestBlink1Device({ requestDevice: async options => { filter = options; return [d]; } }), d);
  assert.deepEqual(filter, { filters: [{ vendorId: 0x27b8, productId: 0x01ed }] });
  assert.equal(d.opened, false);
});
test('worker opens exactly one granted blink1 without calling the chooser', async () => {
  const d = device(); let prompts = 0;
  const transport = new Blink1WebHID({ hid: { requestDevice() { prompts++; throw new Error('worker cannot prompt'); }, getDevices: async () => [deviceWithWrongID(), d] } });
  await transport.connectGranted();
  assert.equal(transport.connected, true); assert.equal(prompts, 0);
});
function deviceWithWrongID() { return { vendorId: 1, productId: 2 }; }
test('worker rejects multiple granted lights instead of choosing the first', async () => {
  const ds = [device(), device()];
  const transport = new Blink1WebHID({ hid: { getDevices: async () => ds } });
  await assert.rejects(transport.connectGranted(), { code: 'ambiguous_devices' });
  assert(ds.every(d => !d.opened));
});
test('worker reports missing permission without discovery prompt', async () => {
  const transport = new Blink1WebHID({ hid: { getDevices: async () => [] } });
  await assert.rejects(transport.connectGranted(), { code: 'permission_required' });
});
test('failed browser open is actionable, does not write, and permits an explicit retry', async () => {
  const d = device(); let opens = 0, writes = 0, prompts = 0;
  const cause = new DOMException('Failed to open the device.', 'NetworkError');
  d.open = async () => { opens++; throw cause; };
  d.sendFeatureReport = async () => { writes++; };
  const transport = new Blink1WebHID({ hid: { requestDevice: async () => { prompts++; return [d]; } } });
  await assert.rejects(transport.connect(), error => error.code === 'open_failed' && error.cause === cause && error.message.includes('daemon'));
  assert.equal(opens, 1); assert.equal(prompts, 1); assert.equal(writes, 0);
  assert.equal(transport.connected, false); assert.equal(transport.uncertain, false); assert.equal(transport.deviceInfo, null);
  d.open = async () => { opens++; d.opened = true; };
  await transport.connect();
  assert.equal(transport.connected, true); assert.equal(opens, 2); assert.equal(prompts, 2); assert.equal(writes, 0);
});
test('worker open failure keeps the original cause and never prompts or sends', async () => {
  const d = device(); let enumerations = 0, prompts = 0, writes = 0;
  const cause = new Error('OS rejected device access');
  d.open = async () => { throw cause; };
  d.sendFeatureReport = async () => { writes++; };
  const transport = new Blink1WebHID({ hid: { getDevices: async () => { enumerations++; return [d]; }, requestDevice: async () => { prompts++; return []; } } });
  await assert.rejects(transport.connectGranted(), error => error.code === 'open_failed' && error.cause === cause);
  assert.equal(enumerations, 1); assert.equal(prompts, 0); assert.equal(writes, 0); assert.equal(transport.connected, false);
});
test('single target command sends stop then canonical RGB and reports acceptance only', async () => {
  const calls = [];
  const result = await sendPreview(preview(), { async stopNativePlayback() { calls.push('stop'); }, async fadeTo(target) { calls.push(target); } });
  assert.deepEqual(calls, ['stop', { r: 170, g: 187, b: 204, led: 0, fadeMs: 1000, color: '#aabbcc' }]);
  assert.equal(result.status, 'command_sent'); assert.equal(result.optical_completion_measured, false); assert.equal('job' in result, false);
});
test('unsupported or malformed plans never stop or write the device', async () => {
  let writes = 0; const transport = { async stopNativePlayback() { writes++; }, async fadeTo() { writes++; } };
  const altered = [
    p => p.sequence.steps.push(p.sequence.steps[0]), p => p.sequence.repeat = 2,
    p => p.sequence.on_finish = 'off', p => p.sequence.steps[0].hold_ms = 1,
    p => p.sequence.steps[0].targets[0].led = 'all', p => p.sequence.steps[0].targets[0].color = 'red',
    p => p.sequence.steps[0].fade_ms = 1, p => p.sequence.initial = [],
  ];
  for (const change of altered) { const p = preview(); change(p); assert.equal(canSendPreview(p), false); await assert.rejects(sendPreview(p, transport), { code: 'preview_only' }); }
  assert.equal(writes, 0);
});
test('unknown stop outcome prevents the following color write', async () => {
  let colors = 0;
  await assert.rejects(sendPreview(preview(), { async stopNativePlayback() { throw Object.assign(new Error('unknown'), { code: 'outcome_unknown' }); }, async fadeTo() { colors++; } }), { code: 'outcome_unknown' });
  assert.equal(colors, 0);
});
