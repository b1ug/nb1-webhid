import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createController, STATE_KEY } from '../src/shared/extension-controller.js';

const plan = color => ({ sequence: { timing: 'serial', repeat: 1, on_finish: 'hold', steps: [{ targets: [{ led: 0, color }], fade_ms: 0, hold_ms: 0 }] }, total_steps: 1, nominal_duration_ms: 10 });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture({ storage = {}, session = 'a', write, connected = true, resolveColor: suppliedResolver } = {}) {
  const calls = [], alarms = new Map(); let time = 1000000;
  const transport = {
    connected, uncertain: false, deviceInfo: connected ? { productName: 'fixture blink(1)', vendorId: 0x27b8, productId: 0x01ed } : null,
    async connectGranted() { calls.push('connect'); this.connected = true; this.deviceInfo = { productName: 'fixture blink(1)' }; },
    async stopNativePlayback() { calls.push('stop'); if (write) await write(this); },
    async fadeTo(target) { calls.push({ target }); },
    async disconnect() { calls.push('close'); this.connected = false; this.deviceInfo = null; },
  };
  const chrome = {
    storage: { local: { async get(key) { calls.push('get'); return structuredClone({ [key]: storage[key] }); }, async set(data) { calls.push({ save: structuredClone(data) }); Object.assign(storage, structuredClone(data)); } } },
    alarms: { async create(name, value) { calls.push({ alarm: name }); alarms.set(name, value); }, async clear(name) { calls.push({ clear: name }); return alarms.delete(name); } },
  };
  const compile = async action => { calls.push({ compile: structuredClone(action) }); return plan(action.kind === 'off' ? '#000000' : action.color); };
  const fixtureColors = new Map([['"red"', '#ff0000'], ['"#084000"', '#084000']]);
  const resolveColor = async raw => {
    calls.push({ resolveColor: raw });
    if (suppliedResolver) return suppliedResolver(raw);
    if (!fixtureColors.has(raw)) throw Object.assign(new Error('Invalid fixture color'), { code: 'invalid_input' });
    return { canonical_color: fixtureColors.get(raw) };
  };
  const controller = createController({ chrome, transport, compile, resolveColor, now: () => time, session });
  return { controller, chrome, calls, transport, storage, alarms, setTime(value) { time = value; } };
}

test('construction and state inspection never prompt or open hardware', async () => {
  const f = fixture({ connected: false }); assert.deepEqual(f.calls, []);
  const state = await f.controller.dispatch({ op: 'status' });
  assert.equal(state.connected, false); assert.deepEqual(f.calls, ['get']);
});
test('explicit ownership confirmation is required before worker opens', async () => {
  const f = fixture({ connected: false });
  await assert.rejects(f.controller.dispatch({ op: 'connect' }), { code: 'ownership_confirmation_required' });
  assert.equal(f.calls.includes('connect'), false);
  const result = await f.controller.dispatch({ op: 'connect', otherControllersStopped: true });
  assert.equal(result.connected, true); assert.equal(result.busy, null); assert.equal(f.calls.includes('stop'), false);
});
test('timer compiles before scheduling; only its due event writes, once', async () => {
  const f = fixture();
  const scheduled = await f.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: '"red"' });
  assert.equal(scheduled.timer.color, '#ff0000'); assert.equal(scheduled.busy, null);
  assert.equal(f.calls.includes('stop'), false); assert.equal(f.alarms.size, 1);
  const name = [...f.alarms.keys()][0];
  f.setTime(scheduled.timer.deadline);
  const completed = await f.controller.onAlarm({ name });
  assert.equal(completed.timer, null); assert.equal(completed.lastEvent.status, 'command_sent'); assert.equal(completed.busy, null);
  assert.equal(f.calls.filter(x => x === 'stop').length, 1);
  const beforeWrite = f.calls.findIndex(x => x === 'stop');
  assert(f.calls.slice(0, beforeWrite).some(x => x.save?.[STATE_KEY]?.timer === null && x.save[STATE_KEY].lastEvent?.status === 'sending'));
  await f.controller.onAlarm({ name }); assert.equal(f.calls.filter(x => x === 'stop').length, 1);
});
test('cancelled, replaced and early alarms do not start the current timer', async () => {
  const f = fixture();
  await f.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: '"red"' }); const old = [...f.alarms.keys()][0];
  const next = await f.controller.dispatch({ op: 'timer', minutes: 2, colorJSON: '"#084000"' }); const current = [...f.alarms.keys()][0];
  assert.notEqual(old, current); assert.equal(f.alarms.size, 1);
  f.setTime(next.timer.deadline - 1); await f.controller.onAlarm({ name: current }); await f.controller.onAlarm({ name: old });
  assert.equal(f.calls.includes('stop'), false);
  await f.controller.dispatch({ op: 'cancel-timer' }); f.setTime(next.timer.deadline); await f.controller.onAlarm({ name: current });
  assert.equal(f.calls.includes('stop'), false); assert.equal(f.alarms.size, 0);
});
test('background restart consumes the stored timer without reconnect or replay', async () => {
  const storage = {}, first = fixture({ storage, session: 'first' });
  const scheduled = await first.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: '"red"' }); const name = [...first.alarms.keys()][0];
  const next = fixture({ storage, session: 'next', connected: false }); next.setTime(scheduled.timer.deadline + 1000);
  const state = await next.controller.dispatch({ op: 'status' }); await next.controller.onAlarm({ name });
  assert.equal(state.timer, null); assert.equal(state.lastEvent.status, 'interrupted');
  assert.equal(next.calls.includes('connect'), false); assert.equal(next.calls.includes('stop'), false);
});
test('disconnected due event becomes missed and is never replayed after reconnect', async () => {
  const f = fixture(); const scheduled = await f.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: '"red"' }); const name = [...f.alarms.keys()][0];
  f.transport.connected = false; f.setTime(scheduled.timer.deadline);
  const state = await f.controller.onAlarm({ name }); assert.equal(state.lastEvent.status, 'missed');
  f.transport.connected = true; await f.controller.onAlarm({ name }); assert.equal(f.calls.includes('stop'), false);
});
test('failed write remains unknown, consumes the timer and is not retried', async () => {
  const f = fixture({ write: async transport => { transport.connected = false; transport.uncertain = true; throw Object.assign(new Error('lost acknowledgement'), { code: 'outcome_unknown' }); } });
  const s = await f.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: '"red"' }); const name = [...f.alarms.keys()][0]; f.setTime(s.timer.deadline);
  const state = await f.controller.onAlarm({ name }); assert.equal(state.lastEvent.status, 'outcome_unknown'); assert.equal(state.timer, null);
  await f.controller.onAlarm({ name }); assert.equal(f.calls.filter(x => x === 'stop').length, 1);
  await assert.rejects(f.controller.dispatch({ op: 'set', colorJSON: '"red"' }), { code: 'outcome_unknown' });
});
test('read-only status stays responsive while browser I/O is pending', async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const f = fixture({ write: () => held }); const sending = f.controller.dispatch({ op: 'set', colorJSON: '"red"' }); await tick();
  const state = await Promise.race([f.controller.dispatch({ op: 'status' }), new Promise((_, reject) => setTimeout(() => reject(new Error('status blocked behind HID')), 100))]);
  assert.equal(state.busy, 'set'); assert.equal(state.lastEvent.status, 'sending');
  release(); const done = await sending; assert.equal(done.busy, null);
});
test('disconnect cancels a reminder and does not implicitly send Off', async () => {
  const f = fixture(); await f.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: '"red"' });
  const state = await f.controller.dispatch({ op: 'disconnect' });
  assert.equal(state.timer, null); assert.equal(state.connected, false); assert.equal(f.calls.includes('close'), true); assert.equal(f.calls.includes('stop'), false);
});
test('invalid minutes never create an alarm or send a command', async () => {
  const f = fixture();
  for (const minutes of [0, 0.5, 1441, '1', NaN]) await assert.rejects(f.controller.dispatch({ op: 'timer', minutes, colorJSON: '"red"' }), { code: 'invalid_request' });
  assert.equal(f.alarms.size, 0); assert.equal(f.calls.includes('stop'), false);
});
test('a resolver rejection preserves original JSON and cannot compile, schedule or write', async () => {
  const raw = '{"space":"rgb8","r":1,"r":2,"g":0,"b":0}';
  const f = fixture({ resolveColor: async received => {
    assert.equal(received, raw);
    throw Object.assign(new Error('duplicate color field: r'), { code: 'invalid_input' });
  } });
  await assert.rejects(f.controller.dispatch({ op: 'set', colorJSON: raw }), { code: 'invalid_input' });
  await assert.rejects(f.controller.dispatch({ op: 'timer', minutes: 1, colorJSON: raw }), { code: 'invalid_input' });
  assert.equal(f.calls.filter(x => x.resolveColor === raw).length, 2);
  assert.equal(f.calls.some(x => x.compile), false);
  assert.equal(f.calls.includes('stop'), false);
  assert.equal(f.alarms.size, 0);
});
test('only the raw colorJSON boundary is accepted; old interpreted color messages do not write', async () => {
  const f = fixture();
  await assert.rejects(f.controller.dispatch({ op: 'set', color: 'red' }), { code: 'invalid_request' });
  await assert.rejects(f.controller.dispatch({ op: 'timer', minutes: 1, color: 'red' }), { code: 'invalid_request' });
  assert.equal(f.calls.some(x => x.compile || x.resolveColor), false);
  assert.equal(f.calls.includes('stop'), false);
  assert.equal(f.alarms.size, 0);
});
