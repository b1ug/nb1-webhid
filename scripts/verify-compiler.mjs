// Offline compiler parity check. This script never imports a browser HID API.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(directory, 'artifacts/compiler');
fs.mkdirSync(artifacts, {recursive: true});
const call = (method, input, ok = true, expected = null, aliases = null) => ({
  method, raw: JSON.stringify(input), aliases: aliases ? JSON.stringify(aliases) : '', ok, expected,
});
const vectors = [
  call('resolveColor', 'red', true, '#ff0000'),
  call('resolveColor', '#abc', true, '#aabbcc'),
  call('resolveColor', '#ABCDEF', true, '#abcdef'),
  call('resolveColor', 'aliceblue', true, '#f0f8ff'),
  call('resolveColor', { space: 'rgb8', r: 8, g: 16, b: 32 }, true, '#081020'),
  call('resolveColor', { space: 'hsv', h_deg: 120, s_pct: 100, v_pct: 50 }, true, '#008000'),
  call('resolveColor', { space: 'hsv', h_deg: 360, s_pct: 100, v_pct: 100 }, true, '#ff0000'),
  call('resolveColor', '@mint', true, '#80c0a0', { mint: '#80c0a0' }),
  call('resolveColor', '@missing', false),
  call('resolveColor', { space: 'hsb', h_deg: 120, s_pct: 100, b_pct: 50 }, false),
  call('compileAction', { kind: 'set', color: '#abc' }),
  call('compileAction', { kind: 'off' }),
  call('compileAction', { kind: 'fade', color: 'red', duration_ms: 3000 }),
  call('compileAction', { kind: 'blink', color: 'blue', on_ms: 1000, off_ms: 1000, cycles: 3 }),
  call('compileAction', { kind: 'breathe', color: '#080808', period_ms: 4000, cycles: 2 }),
  call('compileAction', { kind: 'pulse', color: '#080808', attack_ms: 300, decay_ms: 700, rest_ms: 1000, cycles: 3 }),
  call('compileAction', { kind: 'alternate', colors: ['red', 'blue'], period_ms: 6000 }),
  call('compileAction', { kind: 'orbit', colors: ['red', 'blue'], period_ms: 6000 }),
  call('compileAction', { kind: 'rainbow', period_ms: 7000 }),
  call('compileAction', { kind: 'set', color: '@mint' }, true, null, { mint: '#80c0a0' }),
  call('compileSequence', { timing: 'serial', steps: [{ targets: [{ led: 0, color: 'red' }], hold_ms: 1000 }, { targets: [{ led: 2, color: '#abc' }], fade_ms: 500 }], on_finish: 'off' }),
  call('compileSequence', { timing: 'interval', initial: [{ led: 1, color: 'red' }, { led: 2, color: 'blue' }], steps: [{ targets: [{ led: 1, color: { space: 'hsv', h_deg: 240, s_pct: 100, v_pct: 100 } }, { led: 2, color: '#f00' }], fade_ms: 1000, interval_ms: 1500 }], repeat: 2 }),
  call('compileSequence', { timing: 'serial', steps: [{ targets: [{ led: 0, color: '@mint' }] }] }, true, null, { mint: '#80c0a0' }),
  call('compileAction', { kind: 'spin', colors: ['red', 'blue'] }, false),
  call('compileAction', { kind: 'set', color: 'red', cycles: 1 }, false),
  call('compileAction', { kind: 'fade', color: 'red', duration_ms: 3 }, false),
  call('compileAction', { kind: 'rainbow', period_ms: 1 }, false),
  call('compileAction', { kind: 'off', led: 'all' }, false),
  call('compileAction', { kind: 'set', color: null }, false),
  call('compileSequence', { timing: 'serial', steps: [{ targets: [{ color: 'red' }] }] }, false),
  call('compileSequence', { timing: 'serial', steps: [{ targets: [{ led: 0, color: 'red' }] }], repeat: 0 }, false),
  call('compileSequence', { timing: 'interval', initial: [{ led: 1, color: 'red' }], steps: [{ targets: [{ led: 1, color: 'blue' }], fade_ms: 2000, interval_ms: 1000 }] }, false),
  { method: 'compileAction', raw: '{"kind":"off","kind":"set"}', aliases: '', ok: false },
  { method: 'compileAction', raw: '{} trailing', aliases: '', ok: false },
  { method: 'compileAction', raw: '{"kind":"set","color":"@mint"}', aliases: '{"mint":"#123456","mint":"#abcdef"}', ok: false },
  call('compileRequest', { action: { kind: 'set', color: '#abc' } }),
  call('compileRequest', { sequence: { timing: 'serial', steps: [{ targets: [{ led: 0, color: 'red' }], hold_ms: 1000 }], on_finish: 'hold' } }),
  call('compileRequest', { action: { kind: 'set', color: '@mint' } }, true, null, { mint: '#80c0a0' }),
  call('compileRequest', {}, false),
  call('compileRequest', { action: { kind: 'off' }, sequence: { timing: 'serial', steps: [] } }, false),
  call('compileRequest', { action: null }, false),
  call('compileRequest', { action: { kind: 'off' }, unknown: 1 }, false),
  { method: 'compileRequest', raw: '{"action":{"kind":"off"},"action":{"kind":"off"}}', aliases: '', ok: false },
  { method: 'compileRequest', raw: '{"action":{"kind":"off","kind":"off"}}', aliases: '', ok: false },
  { method: 'compileRequest', raw: '{"Action":{"kind":"off"}}', aliases: '', ok: false },
  { method: 'compileRequest', raw: '{"action":{"kind":"off"}} trailing', aliases: '', ok: false },
  { method: 'compileRequest', raw: '{"action":{"kind":"set","color":"\\ud800"}}', aliases: '', ok: false },
  call('planSequence', {timing:'serial',steps:[{targets:[{led:0,color:'red'}],fade_ms:20,hold_ms:30},{targets:[{led:1,color:'#abc'}]}],repeat:2,on_finish:'off'}),
  call('planSequence', {timing:'interval',initial:[{led:1,color:'red'},{led:2,color:'blue'}],steps:[{targets:[{led:1,color:'blue'},{led:2,color:'red'}],fade_ms:50,interval_ms:50}],repeat:2,on_finish:'hold'}),
  call('planSequence', {timing:'serial',steps:[{targets:[{led:9,color:'red'}]}]}, false),
  {method:'planSequence',raw:'{"timing":"serial","steps":[],"steps":[]}',aliases:'',ok:false},
];

const native = spawnSync(path.join(directory, '.cache/compiler-test', process.platform === 'win32' ? 'native-oracle.exe' : 'native-oracle'), [], {
  input: vectors.map(({ method, raw, aliases }) => JSON.stringify({ method, raw, aliases })).join('\n') + '\n',
  encoding: 'utf8', timeout: 30000,
});
assert.equal(native.status, 0, native.stderr);
const reference = native.stdout.trim().split('\n').map(JSON.parse);
await import('../.cache/compiler/wasm_exec.js');
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(directory, '.cache/compiler/nb1.wasm')), go.importObject);
go.run(instance);
assert.ok(globalThis.nb1Go, 'Go bridge registers its API before returning to JS');
const info = JSON.parse(globalThis.nb1Go.info());
assert.equal(info.ok, true);
assert.equal(info.result.hardware_io, false);
const results = [];
for (let index = 0; index < vectors.length; index++) {
  const vector = vectors[index];
  const result = JSON.parse(globalThis.nb1Go[vector.method](vector.raw, vector.aliases));
  assert.deepEqual(result, reference[index], `native/wasm parity vector ${index}`);
  assert.equal(result.ok, vector.ok, `expected acceptance vector ${index}: ${JSON.stringify(result)}`);
  if (vector.expected) assert.equal(result.result.canonical_color, vector.expected);
  results.push({ index, request: vector, native: reference[index], wasm: result, pass: true });
}
const rainbow = results.find(row => row.request.method === 'compileAction' && JSON.parse(row.request.raw).kind === 'rainbow').wasm.result;
assert.equal(rainbow.nominal_duration_ms, 7000);
assert.deepEqual(rainbow.sequence.steps.map(step => step.targets[0].color), ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#8f00ff', '#ff0000']);
const orbit = results.find(row => row.request.method === 'compileAction' && JSON.parse(row.request.raw).kind === 'orbit').wasm.result;
assert.equal(orbit.sequence.timing, 'interval');
assert.equal(orbit.sequence.steps.length, 4);
assert.ok(orbit.sequence.steps.every(step => step.targets.length === 2));
for (const row of results.filter(row => row.wasm.ok && ['compileAction', 'compileSequence', 'compileRequest'].includes(row.request.method))) {
  const exported = JSON.stringify({sequence: row.wasm.result.sequence});
  const imported = JSON.parse(globalThis.nb1Go.compileRequest(exported));
  assert.equal(imported.ok, true, 'canonical Request import is valid');
  assert.deepEqual(imported.result, row.wasm.result, 'canonical Request round trip preserves the compiled Sequence');
}
// Every existing Action also reaches the shared planner and the actual browser
// runner. Only the clock and device are fake; no recipe is recreated here.
const actions = results.filter(row => row.wasm.ok && row.request.method === 'compileAction');
assert.equal(new Set(actions.map(row=>JSON.parse(row.request.raw).kind)).size,9);
const planRequests = actions.map(row => ({method:'planSequence',raw:JSON.stringify(row.wasm.result.sequence),aliases:''}));
const nativePlans = spawnSync(path.join(directory,'.cache/compiler-test',process.platform==='win32'?'native-oracle.exe':'native-oracle'),[],{
  input:planRequests.map(value=>JSON.stringify(value)).join('\n')+'\n',encoding:'utf8',timeout:30000,
});
assert.equal(nativePlans.status,0,nativePlans.stderr);
const referencePlans=nativePlans.stdout.trim().split('\n').map(JSON.parse);
const {SequencePlayer}=await import('../src/shared/player.js');
const playback=[];
for(const [index,row] of actions.entries()){
  const answer=JSON.parse(globalThis.nb1Go.planSequence(planRequests[index].raw));
  assert.deepEqual(answer,referencePlans[index],'native/WASM playback planner parity');
  assert.equal(answer.ok,true);
  const plan=answer.result;let now=0;const writes=[],preflight=[];
  const player=new SequencePlayer({planner:async()=>plan,clock:{now:()=>now,sleep:async ms=>{now+=ms;}},transport:{connected:true,uncertain:false,
    disableServerDown:async()=>{preflight.push('D');},stopNativePlayback:async()=>{preflight.push('p');},fadeTo:async target=>{writes.push(target);}}});
  assert.equal((await player.play(row.wasm.result)).status,'completed');
  assert.equal(player.running,false);
  assert.deepEqual(preflight,['D','p']);
  assert.equal(writes.length,plan.total_target_writes);
  assert.equal(now,plan.nominal_duration_ms+plan.finish.reduce((sum,target)=>sum+target.wait_after_ms,0));
  playback.push({kind:JSON.parse(row.request.raw).kind,timing:plan.timing,steps:plan.total_steps,writes:writes.length,elapsed_ms:now,native_wasm_equal:true});
}
const wrongArgument = JSON.parse(globalThis.nb1Go.compileAction({ kind: 'off' }));
assert.equal(wrongArgument.ok, false);
fs.writeFileSync(path.join(artifacts, 'node-parity.json'), JSON.stringify({
  status: 'PASS', runtime: process.version, source_commit: info.result.source_commit,
  hardware_access: false, actual_wasm_instantiated: true, vector_count: vectors.length,
  native_wasm_equal: true, same_shared_source: true,
  extra_checks: { seven_color_rainbow: true, paired_orbit_steps: true, wrong_js_argument_rejected: true, canonical_request_round_trip: true, strict_request_envelope: true },
  info: info.result, vectors: results, playback,
}, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', vectors: vectors.length, actions_played_with_fake_device:playback.length, actual_wasm_instantiated: true, hardware_access: false }));
process.exit(0);
