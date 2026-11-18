// Independent acceptance tests: production player + production transport, fake HID only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SequencePlayer } from '../src/shared/player.js';
import { Blink1WebHID } from '../src/shared/transport.js';
// Independent, local-only QA fixtures. No browser, USB, service or network access.
const flush = () => new Promise(resolve => setImmediate(resolve));
const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class ManualClock {
  #time = 0;
  #next = 0;
  #timers = new Set();
  now = () => this.#time;
  get pending() { return [...this.#timers].map(timer => timer.deadline).sort((a, b) => a - b); }
  sleep = (ms, signal) => {
    if (!Number.isFinite(ms) || ms < 0) return Promise.reject(new Error('Invalid fake sleep'));
    if (signal?.aborted) return Promise.reject(this.#aborted());
    if (ms === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = { id: ++this.#next, deadline: this.#time + ms, resolve, reject, signal };
      timer.abort = () => { this.#remove(timer); reject(this.#aborted()); };
      this.#timers.add(timer);
      signal?.addEventListener('abort', timer.abort, { once: true });
    });
  };
  #aborted() { return Object.assign(new Error('Fake wait aborted'), { name: 'AbortError' }); }
  #remove(timer) { this.#timers.delete(timer); timer.signal?.removeEventListener('abort', timer.abort); }
  elapse(ms) {
    if (!Number.isFinite(ms) || ms < 0) throw new Error('Fake clock cannot go backwards');
    this.#time += ms;
    for (const timer of [...this.#timers].sort((a, b) => a.deadline - b.deadline || a.id - b.id)) {
      if (timer.deadline > this.#time) continue;
      this.#remove(timer); timer.resolve();
    }
  }
  async advance(ms) { this.elapse(ms); await flush(); }
  async drain({ limit = 10000 } = {}) {
    await flush();
    for (let index = 0; this.#timers.size; index++) {
      if (index >= limit) throw new Error('Fake clock drain limit reached');
      await this.advance(Math.max(0, this.pending[0] - this.#time));
    }
    await flush();
  }
}

function fakeHID({ clock = new ManualClock(), onWrite, closeFailure } = {}) {
  const events = new Map(), writes = [];
  const calls = { opens: 0, closes: 0, pickers: 0, grants: 0 };
  const device = {
    productName: 'QA blink(1)', vendorId: 0x27b8, productId: 0x01ed, opened: false,
    async open() { calls.opens++; this.opened = true; },
    async close() { calls.closes++; if (closeFailure) throw closeFailure; this.opened = false; },
    async sendFeatureReport(id, data) {
      const value = { index: writes.length + 1, id, bytes: Array.from(data), startedAt: clock.now() };
      writes.push(value);
      try { if (onWrite) await onWrite(value, clock); }
      finally { value.returnedAt = clock.now(); }
    },
  };
  const hid = {
    async requestDevice() { calls.pickers++; return [device]; },
    async getDevices() { calls.grants++; return [device]; },
    addEventListener(name, listener) { const listeners = events.get(name) || new Set(); listeners.add(listener); events.set(name, listeners); },
  };
  const unplug = () => { device.opened = false; for (const listener of events.get('disconnect') || []) listener({ device }); };
  return { clock, hid, device, calls, writes, unplug };
}


const target = (led, color, fade_ms = 0, wait_before_ms = 0, wait_after_ms = 0) => ({ led, color, fade_ms, wait_before_ms, wait_after_ms });
function serialPlan({ finish = 'hold' } = {}) {
  return { contract: 'nb1-sequence-playback/v1', timing: 'serial', initial: [],
    steps: [0, 1].map(index => ({ index, repeat_index: index, step_index: 0, nominal_offset_ms: index * 60, targets: [target(1, '#ff0000', 20)], wait_after_ms: 60, deadline_ms: 0, settle_after_ms: 0 })),
    finish: finish === 'off' ? [target(0, '#000000', 0, 0, 10)] : [], nominal_duration_ms: 120, total_steps: 2, total_target_writes: finish === 'off' ? 3 : 2, on_finish: finish };
}
function intervalPlan({ repeat = 1 } = {}) {
  return { contract: 'nb1-sequence-playback/v1', timing: 'interval', initial: [target(1, '#000000', 0, 0, 10), target(2, '#000000', 0, 0, 10)],
    steps: Array.from({ length: repeat }, (_, index) => ({ index, repeat_index: index, step_index: 0, nominal_offset_ms: 20 + index * 50, targets: [target(1, '#ff0000', 50), target(2, '#0000ff', 50, 10)], wait_after_ms: 0, deadline_ms: 50, settle_after_ms: index === repeat - 1 ? 60 : 0 })),
    finish: [target(0, '#000000', 0, 0, 10)], nominal_duration_ms: 20 + repeat * 50 + 20, total_steps: repeat, total_target_writes: 3 + repeat * 2, on_finish: 'off' };
}
async function setup(plan, { onWrite, planner } = {}) {
  const clock = new ManualClock(), fake = fakeHID({ clock, onWrite }), states = [], notifications = [];
  let player;
  const transport = new Blink1WebHID({ hid: fake.hid, onDisconnect: () => { void player?.stop().catch(() => {}); } });
  await transport.connect();
  player = new SequencePlayer({ transport, clock, onState: value => { states.push(structuredClone(value)); notifications.push({ value: structuredClone(value), running: player.running }); }, planner: planner || (async () => structuredClone(plan)) });
  const sequence = { timing: plan.timing, steps: plan.steps.filter(step => step.repeat_index === 0).map(step => ({
    targets: step.targets.map(value => ({ led: value.led, color: value.color })), fade_ms: step.targets[0].fade_ms,
    ...(plan.timing === 'serial' ? { hold_ms: 30 } : { interval_ms: step.deadline_ms }),
  })), repeat: plan.steps.at(-1).repeat_index + 1, on_finish: plan.on_finish };
  if (plan.timing === 'interval') sequence.initial = plan.initial.map(value => ({ led: value.led, color: value.color }));
  return { ...fake, transport, player, states, notifications, compiled: { sequence, total_steps: plan.total_steps, nominal_duration_ms: plan.nominal_duration_ms } };
}
const colors = f => f.writes.filter(write => write.bytes[0] === 0x63);
const keepResult = promise => Promise.allSettled([promise]);

// Golden fixtures are hand-computed from the audited native schedule; they do not
// reproduce or replace Go Action mathematics or the production planner.
test('serial waits fade+hold+update after each returned write; finish off is additional', async () => {
  const f = await setup(serialPlan({ finish: 'off' }));
  const result = keepResult(f.player.play(f.compiled));
  await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.deepEqual(colors(f).map(write => write.startedAt), [0, 60, 120]);
  assert.deepEqual(colors(f).at(-1).bytes, [0x63, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(f.clock.now(), 130);
  assert.equal(f.player.running, false);
});

test('interval waits for the second LED final fade beyond its final interval', async () => {
  const f = await setup(intervalPlan());
  const result = keepResult(f.player.play(f.compiled));
  await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.deepEqual(colors(f).map(write => write.startedAt), [0, 10, 20, 30, 90]);
  assert.equal(f.clock.now(), 100);
});

test('initial spacing and final settling use actual write returns including HID delay', async () => {
  const f = await setup(intervalPlan(), { onWrite(write, clock) { if (write.bytes[0] === 0x63) clock.elapse(3); } });
  const result = keepResult(f.player.play(f.compiled));
  await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.deepEqual(colors(f).map(write => write.startedAt), [0, 13, 26, 39, 102]);
  assert.equal(f.clock.now(), 115);
});

test('initial is not replayed at repeat boundary; settle tail belongs to final Step', async () => {
  const f = await setup(intervalPlan({ repeat: 2 }));
  const result = keepResult(f.player.play(f.compiled));
  await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.deepEqual(colors(f).map(write => write.startedAt), [0, 10, 20, 30, 70, 80, 140]);
  assert.equal(f.clock.now(), 150);
});

test('late dual-LED gap fails before the next target and does not append finish off', async () => {
  const f = await setup(intervalPlan());
  const result = keepResult(f.player.play(f.compiled));
  await flush(); await f.clock.advance(10); await f.clock.advance(10);
  assert.equal(colors(f).length, 3);
  await f.clock.advance(100);
  assert.equal((await result)[0].status, 'rejected');
  assert.equal(colors(f).length, 3);
  assert.equal(f.player.running, false);
});

test('late interval timer starts the next Step from actual time without catch-up writes', async () => {
  const f = await setup(intervalPlan({ repeat: 2 }));
  const result = keepResult(f.player.play(f.compiled));
  await flush(); await f.clock.advance(10); await f.clock.advance(10); await f.clock.advance(10);
  assert.equal(colors(f).length, 4);
  await f.clock.advance(1000);
  assert.equal(colors(f).length, 5);
  assert.equal(colors(f).at(-1).startedAt, 1030);
  await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.deepEqual(colors(f).map(write => write.startedAt), [0, 10, 20, 30, 1030, 1040, 1100]);
});

test('Stop during planner await invalidates the result before preflight', async () => {
  const blocked = gate(), plan = serialPlan();
  const f = await setup(plan, { planner: async () => { await blocked.promise; return plan; } });
  const result = keepResult(f.player.play(f.compiled)); await flush();
  const stopping = f.player.stop();
  blocked.resolve(); await stopping; await result;
  assert.equal(f.writes.length, 0);
  assert.equal(f.player.running, false);
});

test('Stop invalidates future Steps immediately and waits for an in-flight write', async () => {
  const blocked = gate();
  const f = await setup(serialPlan(), { onWrite(write) { if (write.bytes[0] === 0x63) return blocked.promise; } });
  const result = keepResult(f.player.play(f.compiled)); await flush();
  const count = f.writes.length; let stopped = false;
  const stopping = f.player.stop().then(() => { stopped = true; }); await flush();
  assert.equal(stopped, false);
  assert.equal(f.writes.length, count);
  blocked.resolve(); await stopping; await result; await f.clock.drain();
  assert.equal(colors(f).length, 1);
  assert.equal(f.writes.length, count);
  assert.equal(f.player.running, false);
});

test('Off cancels future Steps and sends explicit black after accepted in-flight write', async () => {
  const blocked = gate();
  const f = await setup(serialPlan(), { onWrite(write) { if (write.bytes[0] === 0x63 && write.bytes[1] === 255) return blocked.promise; } });
  const result = keepResult(f.player.play(f.compiled)); await flush();
  const off = f.player.off(); await flush(); assert.equal(colors(f).length, 1);
  blocked.resolve(); await flush(); await f.clock.drain(); await off; await result;
  assert.equal(colors(f).length, 2);
  assert.deepEqual(colors(f).at(-1).bytes, [0x63, 0, 0, 0, 0, 0, 0, 0]);
});

test('failed HID write is unknown with no retries, future Step, or cleanup Off', async () => {
  const f = await setup(serialPlan(), { onWrite(write) { if (write.bytes[0] === 0x63) throw new Error('Lost write acknowledgement'); } });
  const result = await keepResult(f.player.play(f.compiled));
  assert.equal(result[0].status, 'rejected');
  assert.equal(result[0].reason.code, 'outcome_unknown');
  assert.equal(colors(f).length, 1);
  assert.equal(f.transport.uncertain, true);
  const count = f.writes.length;
  await assert.rejects(f.player.off());
  assert.equal(f.writes.length, count);
});

test('an old in-flight completion cannot continue a plan on the replacement connection', async () => {
  const blocked = gate();
  const f = await setup(serialPlan(), { onWrite(write) { if (write.bytes[0] === 0x63) return blocked.promise; } });
  const result = keepResult(f.player.play(f.compiled)); await flush(); f.unplug();
  const replacement = fakeHID({ clock: f.clock }); f.hid.requestDevice = async () => [replacement.device];
  await f.transport.connect(); blocked.resolve(); await result; await f.clock.drain();
  assert.equal(replacement.writes.length, 0);
  assert.equal(colors(f).length, 1);
});

test('finish Off failure is not normal completion and is not retried', async () => {
  const f = await setup(serialPlan({ finish: 'off' }), { onWrite(write) { if (write.bytes[0] === 0x63 && write.bytes[6] === 0) throw new Error('Finish write lost'); } });
  const result = keepResult(f.player.play(f.compiled)); await f.clock.drain();
  const outcome = (await result)[0];
  assert.equal(outcome.status, 'rejected'); assert.equal(outcome.reason.code, 'outcome_unknown');
  assert.equal(colors(f).length, 3);
  assert.equal(f.transport.uncertain, true);
});


test('the planner receives a snapshot of the draft before its asynchronous work', async () => {
  const blocked = gate(), plan = serialPlan(); let received;
  const f = await setup(plan, { planner: async value => { received = value; await blocked.promise; return plan; } });
  const result = keepResult(f.player.play(f.compiled)); await flush();
  f.compiled.sequence.steps[0].targets[0].color = '#00ff00';
  f.compiled.sequence.on_finish = 'off';
  assert.notEqual(received, f.compiled);
  assert.equal(received.sequence.steps[0].targets[0].color, '#ff0000');
  assert.equal(received.sequence.on_finish, 'hold');
  blocked.resolve(); await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.equal(colors(f).length, 2);
});

test('the active plan is detached from mutable planner output', async () => {
  const shared = serialPlan();
  const f = await setup(shared, { planner: async () => shared });
  const result = keepResult(f.player.play(f.compiled)); await flush();
  shared.steps[1].targets[0].color = '#00ff00';
  shared.steps[1].wait_after_ms = 0;
  await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.deepEqual(colors(f).map(write => write.bytes.slice(1, 4)), [[255, 0, 0], [255, 0, 0]]);
  assert.deepEqual(colors(f).map(write => write.startedAt), [0, 60]);
  assert.equal(f.clock.now(), 120);
});

test('a bad index in the final Step is rejected before any preflight write', async () => {
  const plan = serialPlan(); plan.steps[1].index = 99;
  const f = await setup(plan);
  const result = await keepResult(f.player.play(f.compiled));
  assert.equal(result[0].status, 'rejected');
  assert.equal(result[0].reason.code, 'invalid_plan');
  assert.equal(f.writes.length, 0);
});

test('final notifications expose running=false after play and manual Off release ownership', async () => {
  const f = await setup(serialPlan());
  const result = keepResult(f.player.play(f.compiled)); await f.clock.drain();
  assert.equal((await result)[0].status, 'fulfilled');
  assert.equal(f.notifications.at(-1).running, false);
  assert.equal(f.notifications.at(-1).value.state, 'completed');
  await f.player.off();
  assert.equal(f.notifications.at(-1).running, false);
  assert.equal(f.notifications.at(-1).value.state, 'completed');
});

test('connection epoch prevents an old play from writing to a replacement without UI cancellation', async () => {
  const clock = new ManualClock(), first = fakeHID({ clock });
  // Intentionally omit onDisconnect: ownership must also hold for standalone
  // users of SequencePlayer, independently of the website lifecycle callbacks.
  const transport = new Blink1WebHID({ hid: first.hid });
  await transport.connect();
  const player = new SequencePlayer({ transport, clock, planner: async () => serialPlan() });
  const result = keepResult(player.play({ sequence: { timing: 'serial' } }));
  await flush();
  assert.equal(first.writes.filter(write => write.bytes[0] === 0x63).length, 1);

  first.unplug();
  const replacement = fakeHID({ clock });
  first.hid.requestDevice = async () => [replacement.device];
  await transport.connect();
  await clock.advance(60);

  const outcome = (await result)[0];
  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.reason.code, 'connection_changed');
  assert.equal(replacement.writes.length, 0);
  assert.equal(first.writes.filter(write => write.bytes[0] === 0x63).length, 1);
  assert.equal(player.running, false);
});
