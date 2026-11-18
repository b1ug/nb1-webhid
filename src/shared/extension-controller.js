import { Blink1WebHID, Blink1TransportError } from './transport.js';
import { canSendPreview, sendPreview } from './commands.js';

export const STATE_KEY = 'nb1-browser-state-v1';
const ALARM_PREFIX = 'nb1-reminder:';
const emptyState = () => ({ timer: null, lastEvent: null });

// Dependencies make this logic testable without browser permissions or USB.
export function createController({ chrome, hid, compile, resolveColor, now = () => Date.now(), session = globalThis.crypto.randomUUID(), transport: injectedTransport } = {}) {
  let state = emptyState(), init, tail = Promise.resolve(), busy = null, counter = 0;
  const transport = injectedTransport || new Blink1WebHID({ hid, onDisconnect: () => { void enqueue('device-disconnected', () => cancelTimer('device_disconnected')).catch(() => {}); } });
  const save = async () => { await chrome.storage.local.set({ [STATE_KEY]: state }); };
  const event = (status, message) => { state.lastEvent = { status, message, time: now() }; };

  async function initialize() {
    if (init) return init;
    init = (async () => {
      const saved = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
      if (saved && typeof saved === 'object') state = { timer: saved.timer || null, lastEvent: saved.lastEvent || null };
      // Native handles and ownership do not survive worker/browser restart.
      // Consume stale plans rather than reconnecting or replaying them later.
      if (state.timer && state.timer.session !== session) {
        await chrome.alarms.clear(state.timer.alarmName);
        state.timer = null;
        event('interrupted', 'The previous timer was cancelled after the background session ended. Reconnect and start a new timer explicitly.');
        await save();
      } else if (state.lastEvent?.status === 'sending') {
        event('outcome_unknown', 'The background session ended while sending a command. It was not replayed.');
        await save();
      }
    })();
    return init;
  }

  function status() {
    return structuredClone({ connected: transport.connected, uncertain: transport.uncertain, device: transport.deviceInfo, busy, timer: state.timer ? { deadline: state.timer.deadline, color: state.timer.color } : null, lastEvent: state.lastEvent, sessionPolicy: 'no_automatic_reconnect_or_replay' });
  }

  function enqueue(name, action) {
    const result = tail.then(async () => {
      await initialize(); busy = name;
      try { return await action(); }
      finally { busy = null; }
    });
    tail = result.catch(() => {});
    return result;
  }

  async function cancelTimer(reason = 'timer_cancelled') {
    if (!state.timer) return;
    await chrome.alarms.clear(state.timer.alarmName);
    state.timer = null;
    event(reason, reason === 'device_disconnected' ? 'The light disconnected; its timer was cancelled and will not be replayed.' : 'The timer was cancelled.');
    await save();
  }

  async function previewColor(colorJSON) {
    if (typeof colorJSON !== 'string') throw new Blink1TransportError('invalid_request', 'colorJSON must contain the original ColorInput JSON text.');
    const resolved = await resolveColor(colorJSON);
    const preview = await compile({ kind: 'set', color: resolved.canonical_color, led: 0 });
    // sendPreview also checks the complete single-target boundary before I/O.
    if (!canSendPreview(preview)) throw new Blink1TransportError('compiler_failed', 'The compiler did not return a supported single-target Sequence.');
    return preview;
  }

  async function send(preview) {
    if (!transport.connected) throw new Blink1TransportError(transport.uncertain ? 'outcome_unknown' : 'not_connected', 'Connect the light before sending a command.');
    event('sending', 'Sending one command. No automatic retry will be attempted.');
    await save();
    try {
      const result = await sendPreview(preview, transport);
      event(result.status, 'Command sent. The device performs its fade; physical completion was not measured.');
      await save();
      return result;
    } catch (error) {
      event(error.code || 'error', error.message);
      await save();
      throw error;
    }
  }

  async function dispatch(message) {
    if (!message || typeof message !== 'object' || typeof message.op !== 'string') throw new Blink1TransportError('invalid_request', 'An operation is required.');
    // Status bypasses the I/O queue so the popup remains responsive when a
    // native browser call is still pending. It does not inspect hardware.
    if (message.op === 'status') { await initialize(); return status(); }
    return enqueue(message.op, async () => {
      switch (message.op) {
        case 'connect':
          if (message.otherControllersStopped !== true) throw new Blink1TransportError('ownership_confirmation_required', 'Stop other controllers of this light before connecting.');
          await transport.connectGranted();
          event('connected', 'The light is connected. Opening it sent no color commands.'); await save();
          break;
        case 'disconnect':
          await cancelTimer(); await transport.disconnect();
          event('disconnected', 'The connection closed. Disconnect does not change the last color; use Off before disconnecting.'); await save();
          break;
        case 'set':
          await send(await previewColor(message.colorJSON));
          break;
        case 'off':
          await send(await compile({ kind: 'off', led: 0 }));
          break;
        case 'timer': {
          if (!transport.connected) throw new Blink1TransportError('not_connected', 'Connect the light before starting a timer.');
          if (!Number.isInteger(message.minutes) || message.minutes < 1 || message.minutes > 1440) throw new Blink1TransportError('invalid_request', 'Timer minutes must be an integer from 1 to 1440.');
          const preview = await previewColor(message.colorJSON);
          await cancelTimer();
          const timer = { session, alarmName: ALARM_PREFIX + session + ':' + (++counter), deadline: now() + message.minutes * 60000, preview, color: preview.sequence.steps[0].targets[0].color };
          state.timer = timer;
          event('timer_scheduled', 'Timer scheduled. The light will hold the reminder color until you choose Off.');
          // Persist before creating the alarm, avoiding an unrecorded alarm.
          await save();
          try { await chrome.alarms.create(timer.alarmName, { when: timer.deadline }); }
          catch (error) { state.timer = null; event('timer_failed', error.message); await save(); throw error; }
          break;
        }
        case 'cancel-timer': await cancelTimer(); break;
        default: throw new Blink1TransportError('invalid_request', 'Unknown operation.');
      }
    }).then(() => status());
  }

  function onAlarm(alarm) {
    return enqueue('timer-event', async () => {
      const timer = state.timer;
      if (!timer || alarm?.name !== timer.alarmName) return status();
      // An early/stale callback never starts the current plan.
      if (now() < timer.deadline) {
        await chrome.alarms.create(timer.alarmName, { when: timer.deadline });
        return status();
      }
      state.timer = null;
      event('sending', 'Consuming the timer. It will not be replayed after restart.');
      await save();
      if (!transport.connected) {
        event('missed', 'The timer elapsed without a usable connection. It was not replayed.'); await save();
      } else {
        try { await send(timer.preview); }
        catch { /* send persisted the error; event handling never retries. */ }
      }
      return status();
    }).then(() => status());
  }

  return Object.freeze({ initialize, dispatch, onAlarm, status });
}
