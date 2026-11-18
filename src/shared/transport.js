// No discovery, permission prompt, or hardware access occurs at import time.
export const BLINK1_FILTER = Object.freeze({ vendorId: 0x27b8, productId: 0x01ed });

export class Blink1TransportError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'Blink1TransportError';
    this.code = code;
  }
}

export function isBlink1(device) {
  return device?.vendorId === BLINK1_FILTER.vendorId && device?.productId === BLINK1_FILTER.productId;
}

function oneDevice(devices) {
  const matching = devices.filter(isBlink1);
  if (matching.length > 1) throw new Blink1TransportError('ambiguous_devices', 'More than one blink(1) is authorized. This preview requires exactly one authorized light; remove unused device permissions in Chrome before connecting.');
  return matching[0] || null;
}

// Invoke directly from an extension page or website user gesture. This only
// grants permission. A worker must separately retrieve/open the granted device.
export async function requestBlink1Device(hid = globalThis.navigator?.hid) {
  if (!hid?.requestDevice) throw new Blink1TransportError('unsupported', 'WebHID is unavailable. Use a supported desktop browser in a secure context.');
  const devices = await hid.requestDevice({ filters: [{ ...BLINK1_FILTER }] });
  if (!devices?.length) return null;
  if (devices.some(device => !isBlink1(device))) throw new Blink1TransportError('wrong_device', 'The selected device is not a blink(1).');
  return oneDevice(devices);
}

function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Blink1TransportError('invalid_argument', `${name} must be an integer from ${min} to ${max}`);
}

export class Blink1WebHID {
  #hid;
  #device = null;
  #tail = Promise.resolve();
  #connecting = false;
  #closing = false;
  #uncertain = false;
  #generation = 0;

  constructor({ hid = globalThis.navigator?.hid, onDisconnect = () => {} } = {}) {
    this.#hid = hid;
    hid?.addEventListener?.('disconnect', event => {
      if (event.device !== this.#device) return;
      this.#device = null;
      this.#generation++;
      onDisconnect();
    });
  }

  get connected() { return Boolean(this.#device?.opened && !this.#closing && !this.#uncertain); }
  get uncertain() { return this.#uncertain; }
  get connectionEpoch() { return this.#generation; }
  get deviceInfo() {
    if (!this.#device) return null;
    return Object.freeze({ productName: this.#device.productName || 'blink(1)', vendorId: this.#device.vendorId, productId: this.#device.productId });
  }

  async #connect(acquire) {
    if (this.#connecting || this.#closing) throw new Blink1TransportError('busy', 'A connection change is already in progress.');
    if (this.#uncertain) throw new Blink1TransportError('outcome_unknown', 'The previous write outcome is unknown. Disconnect before reconnecting.');
    if (this.connected) return this.deviceInfo;
    this.#connecting = true;
    try {
      const device = await acquire();
      if (!device) return null;
      if (!isBlink1(device)) throw new Blink1TransportError('wrong_device', 'The selected device is not a blink(1).');
      if (!device.opened) {
        try { await device.open(); }
        catch (cause) {
          throw new Blink1TransportError('open_failed', 'The browser could not open blink(1). Stop the native nb1 daemon or disconnect other controllers using this light, then choose it again. If opening still fails, check the browser device permission. No light command was sent.', cause);
        }
      }
      this.#device = device;
      this.#generation++;
      return this.deviceInfo;
    } finally { this.#connecting = false; }
  }

  // Website only: chooser and open remain on an explicit user-activation path.
  connect() { return this.#connect(() => requestBlink1Device(this.#hid)); }

  // MV3 worker: never invokes requestDevice, never auto-selects multiple lights.
  connectGranted() {
    return this.#connect(async () => {
      if (!this.#hid?.getDevices) throw new Blink1TransportError('unsupported', 'WebHID is unavailable in this context.');
      const device = oneDevice(await this.#hid.getDevices());
      if (!device) throw new Blink1TransportError('permission_required', 'Select a blink(1) from the connection page first.');
      return device;
    });
  }

  #enqueue(command) {
    if (this.#connecting || this.#closing) return Promise.reject(new Blink1TransportError('busy', 'A connection change is in progress.'));
    const device = this.#device, generation = this.#generation;
    const result = this.#tail.then(async () => {
      if (this.#uncertain) throw new Blink1TransportError('outcome_unknown', 'The previous write outcome is unknown. No automatic retry was attempted; disconnect before sending more commands.');
      if (generation !== this.#generation || device !== this.#device || !device?.opened) throw new Blink1TransportError('not_connected', 'Connect a blink(1) before sending a command.');
      try { await device.sendFeatureReport(1, command()); }
      catch (cause) {
        if (generation === this.#generation) this.#uncertain = true;
        throw new Blink1TransportError('outcome_unknown', 'The USB write outcome is unknown. No automatic retry was attempted; disconnect before sending more commands.', cause);
      }
    });
    this.#tail = result.catch(() => {});
    return result;
  }

  async fadeTo({ r, g, b, fadeMs = 0, led = 0 } = {}) {
    integer(r, 0, 255, 'r'); integer(g, 0, 255, 'g'); integer(b, 0, 255, 'b');
    integer(led, 0, 2, 'led'); integer(fadeMs, 0, 600000, 'fadeMs');
    if (fadeMs % 10) throw new Blink1TransportError('invalid_argument', 'fadeMs must use 10 ms units.');
    const ticks = fadeMs / 10;
    return this.#enqueue(() => new Uint8Array([0x63, r, g, b, (ticks >> 8) & 0xff, ticks & 0xff, led, 0]));
  }

  stopNativePlayback() { return this.#enqueue(() => new Uint8Array([0x70, 0, 0, 0, 0, 0, 0, 0])); }

  // Disable a previous server-down watchdog while preserving the current RGB.
  // No enable, timeout, pattern row, persistent save or arbitrary mode is exposed.
  disableServerDown() { return this.#enqueue(() => new Uint8Array([0x44, 0, 0, 0, 1, 0, 0, 0])); }

  async disconnect() {
    if (this.#connecting || this.#closing) throw new Blink1TransportError('busy', 'A connection change is already in progress.');
    this.#closing = true;
    try {
      // An in-flight browser HID call cannot be forcibly cancelled by a timer.
      await this.#tail;
      if (this.#device?.opened) await this.#device.close();
      this.#device = null;
      this.#generation++;
      this.#uncertain = false;
    } catch (cause) {
      this.#uncertain = true;
      throw new Blink1TransportError('close_failed', 'The browser could not confirm that the device closed.', cause);
    } finally { this.#closing = false; }
  }
}
