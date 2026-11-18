import assert from 'node:assert/strict';
import { compile } from './compiler.mjs';
import { createTimeline, sampleTimeline } from '../../src/shared/nightlab/preview-timeline.js';

let count = 0;
function test(name, run) {
  run(); count++;
  console.log(`PASS ${name}`);
}
function actionPlan(action) {
  const result = compile('compileAction', action);
  return compile('planSequence', result.sequence);
}
function actionTimeline(action, initial) {
  return createTimeline(actionPlan(action), initial);
}
const at = (timeline, time) => sampleTimeline(timeline, time);

test('real Rainbow compilation drives seven colors, repeat and return to red', () => {
  const plan = actionPlan({kind:'rainbow', led:0, period_ms:1400, cycles:2, on_finish:'hold'});
  const timeline = createTimeline(plan);
  assert.equal(timeline.total, 16);
  assert.equal(timeline.durationMs, 2800);
  assert.deepEqual(at(timeline, 0).colors, ['#ff0000', '#ff0000']);
  assert.deepEqual(plan.steps.slice(0, 8).map(step => step.targets[0].color),
    ['#ff0000','#ffa500','#ffff00','#00ff00','#0000ff','#4b0082','#8f00ff','#ff0000']);
  for (const step of plan.steps) {
    const target = step.targets[0];
    assert.deepEqual(at(timeline, step.nominal_offset_ms + target.fade_ms).colors,
      [target.color, target.color]);
  }
  assert.notEqual(at(timeline, 100).colors[0], '#ff0000');
  assert.deepEqual(at(timeline, 2800).colors, ['#ff0000', '#ff0000']);
  assert.equal(at(timeline, 2800).finished, true);
  assert.equal(at(timeline, 2800).assumedStart, false);
});

test('real Breathe follows its sampled envelope from black to peak and back', () => {
  const plan = actionPlan({kind:'breathe', led:1, color:'#ff0000', period_ms:2000, cycles:1, on_finish:'hold'});
  const timeline = createTimeline(plan);
  assert.equal(plan.steps.length, 17);
  assert.deepEqual(at(timeline, 0).colors, ['#000000', null]);
  const peak = plan.steps[8];
  assert.deepEqual(at(timeline, peak.nominal_offset_ms + peak.targets[0].fade_ms).colors, ['#ff0000', null]);
  assert.deepEqual(at(timeline, 2000).colors, ['#000000', null]);
  assert.equal(at(timeline, 1000).assumedStart, false);
});

test('real Orbit initializes once, preserves paired write spacing and final settle', () => {
  const plan = actionPlan({kind:'orbit', colors:['#ff0000','#0000ff'], leds:[1,2], period_ms:1000, cycles:1, on_finish:'hold'});
  const timeline = createTimeline(plan);
  assert.equal(timeline.durationMs, 1040);
  assert.deepEqual(at(timeline, 0).colors, ['#990000', null]);
  assert.equal(at(timeline, 0).step, 0);
  assert.deepEqual(at(timeline, 10).colors, ['#990000','#000099']);
  assert.equal(at(timeline, 20).step, 1);
  assert.deepEqual(at(timeline, 145).colors, ['#8d0040','#0c005f']);
  assert.deepEqual(at(timeline, 270).colors, ['#800080','#19001f']);
  assert.deepEqual(at(timeline, 1030).colors, ['#990000','#000099']);
  assert.equal(at(timeline, 1030).finished, false);
  assert.equal(at(timeline, 1040).finished, true);
});

test('real Orbit reversed order affects physical channels without renumbering', () => {
  const timeline = actionTimeline({kind:'orbit', colors:['#ff0000','#0000ff'], leds:[2,1], period_ms:1000, cycles:1, on_finish:'hold'});
  assert.deepEqual(at(timeline, 0).colors, [null, '#990000']);
  assert.deepEqual(at(timeline, 10).colors, ['#000099','#990000']);
  assert.deepEqual(at(timeline, 145).colors, ['#0c005f','#8d0040']);
});

test('real Alternate respects A/B initial assignment and serial handover', () => {
  const timeline = actionTimeline({kind:'alternate', colors:['#ff0000','#0000ff'], leds:[2,1], period_ms:1000, cycles:1, on_finish:'hold'});
  assert.deepEqual(at(timeline, 0).colors, [null,'#ff0000']);
  assert.deepEqual(at(timeline, 10).colors, ['#0000ff','#ff0000']);
  assert.deepEqual(at(timeline, 500).colors, ['#0000ff','#0000ff']);
  assert.deepEqual(at(timeline, 510).colors, ['#ff0000','#0000ff']);
  assert.equal(timeline.durationMs, 1000);
});

test('single-target Fade declares an assumed black origin and keeps untouched LED unknown', () => {
  const timeline = actionTimeline({kind:'fade', led:1, color:'#ffffff', duration_ms:1000});
  assert.deepEqual(at(timeline, 0).colors, ['#000000',null]);
  assert.deepEqual(at(timeline, 500).colors, ['#808080',null]);
  assert.deepEqual(at(timeline, 1010).colors, ['#ffffff',null]);
  assert.equal(at(timeline, 1010).finished, true);
  assert.equal(at(timeline, 1010).assumedStart, true);
  assert.deepEqual(at(timeline, 500).assumedChannels, [true,false]);
});

test('known screen origins are respected and do not declare an assumption', () => {
  const timeline = actionTimeline({kind:'fade', led:1, color:'#ffffff', duration_ms:1000}, ['#0000ff','#00ff00']);
  assert.deepEqual(at(timeline, 500).colors, ['#8080ff','#00ff00']);
  assert.equal(at(timeline, 500).assumedStart, false);
  const pair = actionTimeline({kind:'fade', led:0, color:'#ffffff', duration_ms:1000}, ['#0000ff',null]);
  assert.deepEqual(at(pair, 500).colors, ['#8080ff','#808080']);
  assert.deepEqual(at(pair, 500).assumedChannels, [false,true]);
});

test('real on_finish off sends one simultaneous black cleanup after all repeats', () => {
  const plan = actionPlan({kind:'blink', led:1, color:'#ff0000', on_ms:100, off_ms:100, cycles:2, on_finish:'off'});
  const timeline = createTimeline(plan, [null,'#00ff00']);
  assert.equal(plan.nominal_duration_ms, 400);
  assert.equal(timeline.durationMs, 410);
  assert.deepEqual(at(timeline, 200).colors, ['#ff0000','#00ff00']);
  assert.deepEqual(at(timeline, 399).colors, ['#000000','#00ff00']);
  assert.deepEqual(at(timeline, 400).colors, ['#000000','#000000']);
  assert.equal(at(timeline, 400).finished, false);
  assert.equal(at(timeline, 410).finished, true);
  assert.equal(at(timeline, 410).step, 4);
});

test('a later fade continues from an interrupted fade rather than its old target', () => {
  // A deliberate descriptor-level overlap probes interpolation independently
  // of current Go validation (which normally bounds fades by each interval).
  const compiled = compile('compileSequence', {
    timing:'interval', initial:[{led:1,color:'#000000'}], repeat:1, on_finish:'hold',
    steps:[
      {targets:[{led:1,color:'#ff0000'}],fade_ms:100,interval_ms:100},
      {targets:[{led:1,color:'#000000'}],fade_ms:100,interval_ms:100},
    ],
  });
  const plan = compile('planSequence', compiled.sequence);
  plan.steps[0].targets[0].fade_ms = 200;
  const timeline = createTimeline(plan);
  assert.deepEqual(at(timeline, 110).colors, ['#800000',null]);
  assert.deepEqual(at(timeline, 160).colors, ['#400000',null]);
  assert.deepEqual(at(timeline, 210).colors, ['#000000',null]);
});

test('sampling is frame-independent and neither compiler plan nor initial colors mutate', () => {
  const plan = actionPlan({kind:'rainbow', led:0, period_ms:1400, cycles:2, on_finish:'off'});
  const initial = ['#123456', null];
  const before = JSON.stringify({plan,initial});
  const timeline = createTimeline(plan, initial);
  const expected = at(timeline, 1234);
  at(timeline, 2810);
  at(timeline, 0);
  assert.deepEqual(at(timeline, 1234), expected);
  assert.equal(JSON.stringify({plan,initial}), before);
  assert.equal(Object.isFrozen(timeline), true);
  assert.deepEqual(at(timeline, 999999).colors, ['#000000','#000000']);
  assert.deepEqual(at(timeline, -100).colors, at(timeline, 0).colors);
});

test('invalid plans and non-finite sample times fail without partial output', () => {
  assert.throws(() => createTimeline({}), /Invalid Go playback plan/);
  const plan = actionPlan({kind:'set',led:1,color:'#ff0000'});
  assert.throws(() => createTimeline(plan, ['red',null]), /Invalid initial color/);
  const timeline = createTimeline(plan);
  assert.throws(() => sampleTimeline(timeline, NaN), /Invalid timeline sample/);
  plan.steps[0].targets[0].led = 9;
  assert.throws(() => createTimeline(plan), /Invalid target LED/);
});

test('Solid separate LED colors uses two ordered zero-fade Steps in one existing serial Sequence', () => {
  const compiled = compile('compileSequence', {timing:'serial',steps:[
    {targets:[{led:1,color:'#123456'}],fade_ms:0,hold_ms:0},
    {targets:[{led:2,color:'blue'}],fade_ms:0,hold_ms:0},
  ],repeat:1,on_finish:'hold'});
  const plan = compile('planSequence', compiled.sequence), timeline = createTimeline(plan);
  assert.equal(plan.nominal_duration_ms,20);
  assert.equal(plan.steps.length,2);assert.deepEqual(plan.finish,[]);
  assert.deepEqual(at(timeline,0).colors,['#123456',null]);
  assert.deepEqual(at(timeline,10).colors,['#123456','#0000ff']);
  assert.deepEqual(at(timeline,20).colors,['#123456','#0000ff']);
  assert.equal(at(timeline,20).finished,true);
});

console.log(`PASS ${count} pure screen timeline checks using the local Go/WASM compiler; no transport or hardware`);
process.exit(0);
