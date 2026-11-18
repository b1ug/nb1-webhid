import { Blink1TransportError } from './transport.js';

const cancelled = () => new Blink1TransportError('cancelled', 'Sequence scheduling stopped. A fade already sent to the light may finish.');
const overrun = () => new Blink1TransportError('timing_overrun', 'Playback stopped because the browser could not keep the requested timing. Keep this page visible and play again.');
const defaultClock = {
  now: () => performance.now(),
  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(cancelled()); return; }
      const abort = () => { clearTimeout(timer); reject(cancelled()); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
    });
  },
};

async function defaultPlanner(compiled) {
  const { callCompiler } = await import('./compiler-loader.js');
  return callCompiler('planSequence', JSON.stringify(compiled?.sequence));
}

// The Go planner owns Sequence rules, expansion, waits and cleanup scope. This
// boundary checks the entire descriptor before I/O, then only runs writes/waits.
function checkedPlan(plan) {
  const invalid = () => { throw new Blink1TransportError('invalid_plan', 'The Go playback plan is invalid.'); };
  const number = (value, max = 86400000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  const target = value => value && number(value.led, 2) && /^#[0-9a-f]{6}$/.test(value.color) &&
    number(value.fade_ms, 600000) && value.fade_ms % 10 === 0 && number(value.wait_before_ms) && number(value.wait_after_ms);
  if (plan?.contract !== 'nb1-sequence-playback/v1' || !['serial', 'interval'].includes(plan.timing) ||
      !['hold', 'off'].includes(plan.on_finish) || !Array.isArray(plan.initial) || plan.initial.length > 2 ||
      !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 1024 ||
      !Array.isArray(plan.finish) || plan.finish.length > 1 || plan.total_steps !== plan.steps.length) invalid();
  let writes = plan.initial.length + plan.finish.length;
  for (const value of [...plan.initial, ...plan.finish]) if (!target(value)) invalid();
  for (const [index, step] of plan.steps.entries()) {
    if (!step || !Array.isArray(step.targets) || !step.targets.length || step.targets.length > 2 ||
        step.index !== index || !number(step.wait_after_ms) || !number(step.deadline_ms, 600000) || !number(step.settle_after_ms, 600010)) invalid();
    if (plan.timing === 'interval' && step.deadline_ms < 50) invalid();
    for (const value of step.targets) if (!target(value)) invalid();
    writes += step.targets.length;
  }
  if (writes > 2051 || writes !== plan.total_target_writes) invalid();
  if (plan.on_finish === 'hold' && plan.finish.length !== 0) invalid();
  if (plan.on_finish === 'off' && (plan.finish.length !== 1 || plan.finish[0].led !== 0 || plan.finish[0].color !== '#000000' || plan.finish[0].fade_ms !== 0)) invalid();
  return plan;
}

export class SequencePlayer {
  #transport;
  #planner;
  #clock;
  #onState;
  #active = null;
  #maintenance = false;
  #state = { state: 'idle', step: 0, total: 0 };

  constructor({ transport, planner = defaultPlanner, clock = defaultClock, onState = () => {} } = {}) {
    if (!transport) throw new TypeError('SequencePlayer needs a transport.');
    this.#transport = transport; this.#planner = planner; this.#clock = clock; this.#onState = onState;
  }
  get running() { return Boolean(this.#active || this.#maintenance); }
  get state() { return { ...this.#state }; }

  #emit(state) {
    this.#state = { ...this.#state, ...state };
    // Rendering failures cannot interrupt an already accepted hardware command.
    try { this.#onState(this.state); } catch {}
  }
  #check(run, deadline = null) {
    if (run.controller.signal.aborted) throw cancelled();
    if (run.epoch !== undefined && run.epoch !== this.#transport.connectionEpoch) throw new Blink1TransportError('connection_changed', 'The device connection changed. Play again explicitly.');
    if (!this.#transport.connected) throw new Blink1TransportError(this.#transport.uncertain ? 'outcome_unknown' : 'not_connected', 'The device connection is unavailable.');
    if (deadline !== null && this.#clock.now() >= deadline) throw overrun();
  }
  async #waitUntil(end, run) {
    while (true) {
      this.#check(run);
      const remaining = end - this.#clock.now();
      if (remaining <= 0) return;
      await this.#clock.sleep(remaining, run.controller.signal);
      this.#check(run);
      if (this.#clock.now() > end + 1000) throw overrun();
    }
  }
  #wait(ms, run) { return this.#waitUntil(this.#clock.now() + ms, run); }
  async #write(target, run, deadline = null) {
    if (target.wait_before_ms) await this.#wait(target.wait_before_ms, run);
    this.#check(run, deadline);
    await this.#transport.fadeTo({ led: target.led, r: parseInt(target.color.slice(1, 3), 16),
      g: parseInt(target.color.slice(3, 5), 16), b: parseInt(target.color.slice(5, 7), 16), fadeMs: target.fade_ms });
    const returned = this.#clock.now();
    this.#check(run, deadline);
    this.#emit({ state: 'playing', targets: [{ led: target.led, color: target.color }] });
    if (target.wait_after_ms) await this.#wait(target.wait_after_ms, run);
    return returned;
  }
  async #preflight(run) {
    this.#check(run);
    await this.#transport.disableServerDown();
    this.#check(run);
    await this.#transport.stopNativePlayback();
    this.#check(run);
  }

  play(compiled) {
    if (this.running) return Promise.reject(new Blink1TransportError('busy', 'Stop the current Sequence before playing another.'));
    const run = { controller: new AbortController(), done: null, epoch: this.#transport.connectionEpoch };
    this.#active = run;
    run.done = this.#run(compiled, run);
    return run.done;
  }
  async #run(compiled, run) {
    try {
      this.#emit({ state: 'validating', step: 0, total: 0, targets: [], error: null });
      const plan = checkedPlan(structuredClone(await this.#planner(structuredClone(compiled))));
      this.#check(run);
      this.#emit({ state: 'playing', step: 0, total: plan.total_steps });
      await this.#preflight(run);
      for (const target of plan.initial) await this.#write(target, run);
      for (const step of plan.steps) {
        this.#check(run);
        const deadline = plan.timing === 'interval' ? this.#clock.now() + step.deadline_ms : null;
        let returned;
        for (const target of step.targets) returned = await this.#write(target, run, deadline);
        if (deadline !== null) {
          await this.#waitUntil(deadline, run);
          if (step.settle_after_ms) await this.#waitUntil(returned + step.settle_after_ms, run);
        } else await this.#wait(step.wait_after_ms, run);
        this.#emit({ step: step.index + 1 });
      }
      for (const target of plan.finish) await this.#write(target, run);
      this.#check(run);
      const result = { status: 'completed', total_steps: plan.total_steps, optical_completion_measured: false };
      this.#emit({ state: 'completed', step: plan.total_steps });
      return result;
    } catch (error) {
      if ((run.controller.signal.aborted || error.code === 'cancelled') && error.code !== 'outcome_unknown') {
        this.#emit({ state: 'cancelled', error: null });
        return { status: 'cancelled', optical_completion_measured: false };
      }
      this.#emit({ state: 'failed', error });
      throw error;
    } finally { if (this.#active === run) { this.#active = null; this.#emit({}); } }
  }

  async stop() {
    const run = this.#active;
    if (!run) return { status: 'cancelled' };
    run.controller.abort();
    this.#emit({ state: 'stopping' });
    return run.done;
  }

  async off() {
    if (this.#maintenance) throw new Blink1TransportError('busy', 'A device change is already in progress.');
    this.#maintenance = true;
    try {
      await this.stop();
      const run = { controller: new AbortController(), epoch: this.#transport.connectionEpoch };
      await this.#preflight(run);
      await this.#transport.fadeTo({ led: 0, r: 0, g: 0, b: 0, fadeMs: 0 });
      this.#emit({ state: 'completed', step: 0, total: 0, targets: [{ led: 0, color: '#000000' }], error: null });
      return { status: 'command_sent', optical_completion_measured: false };
    } finally { this.#maintenance = false; this.#emit({}); }
  }
}
