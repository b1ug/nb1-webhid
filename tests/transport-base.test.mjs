import assert from "node:assert/strict";
import { test } from "node:test";
import { Blink1WebHID } from "../src/shared/transport.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const gate = () => {
  let release;
  return { promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
};

function fixture({ selected, write, close } = {}) {
  const calls = { picker: [], writes: [], opens: 0, closes: 0 };
  const device = {
    productName: "blink(1) mk2", vendorId: 0x27b8, productId: 0x01ed, opened: false,
    async open() { calls.opens++; this.opened = true; },
    async close() { calls.closes++; if (close) await close(); this.opened = false; },
    async sendFeatureReport(id, data) {
      calls.writes.push({ id, bytes: Array.from(data) });
      if (write) await write(id, data);
    },
  };
  const listeners = new Map();
  const hid = {
    async requestDevice(options) { calls.picker.push(options); return selected ?? [device]; },
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  return { transport: new Blink1WebHID({ hid }), hid, device, calls, listeners };
}

const check = test;

await check("constructor does not prompt, open, or write", async () => {
  const f = fixture();
  assert.deepEqual(f.calls, { picker: [], writes: [], opens: 0, closes: 0 });
  assert.equal(f.transport.connected, false);
  assert.equal(f.transport.deviceInfo, null);
});

await check("explicit connect is narrowly filtered and does not change light", async () => {
  const f = fixture();
  const info = await f.transport.connect();
  assert.deepEqual(f.calls.picker, [{ filters: [{ vendorId: 0x27b8, productId: 0x01ed }] }]);
  assert.deepEqual(info, { productName: "blink(1) mk2", vendorId: 0x27b8, productId: 0x01ed });
  assert.equal("serialNumber" in info, false);
  assert.equal(f.calls.opens, 1);
  assert.equal(f.calls.writes.length, 0);
  assert.equal(f.transport.connected, true);
});

await check("WebHID report ID is separate from exactly eight payload bytes", async () => {
  const f = fixture(); await f.transport.connect();
  await f.transport.fadeTo({ r: 12, g: 34, b: 56, fadeMs: 1000, led: 2 });
  assert.deepEqual(f.calls.writes, [{ id: 1, bytes: [0x63, 12, 34, 56, 0, 100, 2, 0] }]);
});

await check("fade low byte preserves 255 and carries at 256", async () => {
  const f = fixture(); await f.transport.connect();
  for (const fadeMs of [2550, 2560, 600000]) await f.transport.fadeTo({ r: 0, g: 0, b: 0, fadeMs });
  assert.deepEqual(f.calls.writes.map((x) => x.bytes.slice(4, 6)), [[0, 255], [1, 0], [234, 96]]);
});

await check("watchdog disable preserves RGB and cannot enable server-down playback", async () => {
  const f = fixture(); await f.transport.connect();
  await f.transport.disableServerDown();
  assert.deepEqual(f.calls.writes, [{ id: 1, bytes: [0x44, 0, 0, 0, 1, 0, 0, 0] }]);
});

await check("invalid RGB, LED, fractional and out-of-range fade never write", async () => {
  const f = fixture(); await f.transport.connect();
  const valid = { r: 1, g: 2, b: 3, led: 0, fadeMs: 100 };
  const invalid = [{ r: -1 }, { g: 256 }, { b: 0.5 }, { r: "1" }, { b: NaN }, { led: "all" }, { led: 3 }, { fadeMs: 1 }, { fadeMs: 600010 }, { fadeMs: Infinity }];
  for (const fields of invalid) await assert.rejects(f.transport.fadeTo({ ...valid, ...fields }), { code: "invalid_argument" });
  assert.equal(f.calls.writes.length, 0);
});

await check("unconnected write is rejected without chooser", async () => {
  const f = fixture();
  await assert.rejects(f.transport.fadeTo({ r: 0, g: 0, b: 0 }), { code: "not_connected" });
  assert.equal(f.calls.picker.length, 0);
  assert.equal(f.calls.writes.length, 0);
});

await check("concurrent callers are serialized at the USB boundary", async () => {
  let active = 0, maxActive = 0;
  const f = fixture({ write: async () => { active++; maxActive = Math.max(maxActive, active); await tick(); active--; } });
  await f.transport.connect();
  await Promise.all([1, 2, 3].map((r) => f.transport.fadeTo({ r, g: 0, b: 0 })));
  assert.equal(maxActive, 1);
  assert.deepEqual(f.calls.writes.map((x) => x.bytes[1]), [1, 2, 3]);
});

await check("rejected write is not retried and blocks queued writes as unknown", async () => {
  const f = fixture({ write: async () => { throw new Error("simulated lost acknowledgement"); } });
  await f.transport.connect();
  const results = await Promise.allSettled([1, 2].map((r) => f.transport.fadeTo({ r, g: 0, b: 0 })));
  assert(results.every((r) => r.status === "rejected" && r.reason.code === "outcome_unknown"));
  assert.equal(f.calls.writes.length, 1);
  assert.equal(f.transport.uncertain, true);
  assert.equal(f.transport.connected, false);
  await assert.rejects(f.transport.connect(), { code: "outcome_unknown" });
  await f.transport.disconnect();
  assert.equal(f.calls.closes, 1);
  assert.equal(f.transport.uncertain, false);
});

await check("disconnect waits for accepted I/O and rejects new commands", async () => {
  const held = gate();
  const f = fixture({ write: () => held.promise }); await f.transport.connect();
  const write = f.transport.fadeTo({ r: 1, g: 0, b: 0 }); await tick();
  const disconnect = f.transport.disconnect();
  await assert.rejects(f.transport.fadeTo({ r: 2, g: 0, b: 0 }), { code: "busy" });
  assert.equal(f.calls.closes, 0);
  held.release(); await write; await disconnect;
  assert.equal(f.calls.writes.length, 1);
  assert.equal(f.calls.closes, 1);
  assert.equal(f.transport.deviceInfo, null);
});

await check("cancelled picker does not open or write", async () => {
  const f = fixture({ selected: [] });
  assert.equal(await f.transport.connect(), null);
  assert.equal(f.calls.opens, 0);
  assert.equal(f.calls.writes.length, 0);
});

await check("unexpected device cannot be opened through injected chooser", async () => {
  const f = fixture({ selected: [{ vendorId: 0x1234, productId: 0x5678 }] });
  await assert.rejects(f.transport.connect(), { code: "wrong_device" });
  assert.equal(f.calls.opens, 0);
  assert.equal(f.calls.writes.length, 0);
});

await check("only stop form of native PlayLoop is exposed", async () => {
  const f = fixture(); await f.transport.connect(); await f.transport.stopNativePlayback();
  assert.deepEqual(f.calls.writes, [{ id: 1, bytes: [0x70, 0, 0, 0, 0, 0, 0, 0] }]);
  assert.equal(typeof f.transport.sendFeatureReport, "undefined");
  assert.equal(typeof f.transport.writeFlash, "undefined");
});

await check("missing WebHID is a clear unsupported result", async () => {
  const transport = new Blink1WebHID({ hid: null });
  await assert.rejects(transport.connect(), { code: "unsupported" });
});

await check("browser disconnection event invalidates the selected device", async () => {
  const f = fixture(); await f.transport.connect();
  f.listeners.get("disconnect")({ device: f.device });
  assert.equal(f.transport.connected, false);
  await assert.rejects(f.transport.fadeTo({ r: 0, g: 0, b: 0 }), { code: "not_connected" });
  assert.equal(f.calls.writes.length, 0);
});

await check("failed close retains uncertainty rather than claiming release", async () => {
  const f = fixture({ close: async () => { throw new Error("close failed"); } });
  await f.transport.connect();
  await assert.rejects(f.transport.disconnect(), { code: "close_failed" });
  assert.equal(f.transport.uncertain, true);
  assert.equal(f.transport.connected, false);
  assert.notEqual(f.transport.deviceInfo, null);
});

await check("queued command is never replayed onto a replacement connection", async () => {
  const held = gate();
  const f = fixture({ write: () => held.promise });
  await f.transport.connect();
  const first = f.transport.fadeTo({ r: 1, g: 0, b: 0 });
  const queued = f.transport.fadeTo({ r: 2, g: 0, b: 0 });
  const queuedResult = Promise.allSettled([queued]);
  await tick();
  f.listeners.get("disconnect")({ device: f.device });
  const replacement = fixture();
  f.hid.requestDevice = async () => [replacement.device];
  await f.transport.connect();
  held.release(); await first;
  const result = (await queuedResult)[0];
  assert.equal(result.status, "rejected");
  assert.equal(result.reason.code, "not_connected");
  assert.equal(replacement.calls.writes.length, 0);
  assert.equal(f.calls.writes.length, 1);
});

await check("late failure from old connection does not poison a replacement", async () => {
  const held = gate();
  const f = fixture({ write: async () => { await held.promise; throw new Error("old device detached"); } });
  await f.transport.connect();
  const first = f.transport.fadeTo({ r: 1, g: 0, b: 0 });
  const firstResult = Promise.allSettled([first]);
  await tick(); f.listeners.get("disconnect")({ device: f.device });
  const replacement = fixture();
  f.hid.requestDevice = async () => [replacement.device];
  await f.transport.connect(); held.release(); await firstResult;
  assert.equal(f.transport.uncertain, false);
  assert.equal(f.transport.connected, true);
  await f.transport.fadeTo({ r: 3, g: 0, b: 0 });
  assert.equal(replacement.calls.writes.length, 1);
});

