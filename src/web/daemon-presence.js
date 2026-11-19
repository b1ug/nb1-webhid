// Only a user-selected loopback port is configurable. The host and paths stay fixed.
export function daemonOrigin(port) {
  if (typeof port !== 'string' || !/^\d{1,5}$/.test(port)) return null;
  const number = Number(port);
  return number > 0 && number <= 65535 ? 'http://127.0.0.1:' + number : null;
}

async function readRecord(url, signal) {
  const response = await fetch(url, {
    method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
    redirect: 'error', referrerPolicy: 'no-referrer', targetAddressSpace: 'loopback', signal,
  });
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let bytes = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 512) { await reader.cancel(); return null; }
      text += decoder.decode(value, {stream:true});
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

function hasIdentity(record) {
  return record?.service === 'nb1' && record.api_version === 'v1';
}

export async function probeDaemon(port, signal) {
  const origin = daemonOrigin(port);
  if (!origin) return {state:'unconfirmed'};
  let state = 'unconfirmed';
  try {
    const presence = await readRecord(origin + '/v1/presence', signal);
    if (!hasIdentity(presence) || Object.keys(presence).length !== 2) return {state};
    state = 'present';
    if (signal?.aborted) return {state};
    const status = await readRecord(origin + '/v1/service-status', signal);
    if (!hasIdentity(status) || Object.keys(status).length !== 4 || status.health !== 'ok') return {state};
    const devices = status.devices;
    if (devices === null) return {state:'healthy', devices:null};
    if (!devices || Object.keys(devices).length !== 2 || !Number.isSafeInteger(devices.configured) ||
        !Number.isSafeInteger(devices.online) || devices.online < 0 || devices.configured < devices.online) return {state};
    return {state:'healthy', devices:{configured:devices.configured, online:devices.online}};
  } catch {
    // A blocked or unsupported summary does not erase a valid presence response.
    return {state};
  }
}
