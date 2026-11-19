// Only a user-selected loopback port is configurable. The host and path stay fixed.
export function daemonOrigin(port) {
  if (typeof port !== 'string' || !/^\d{1,5}$/.test(port)) return null;
  const number = Number(port);
  return number > 0 && number <= 65535 ? 'http://127.0.0.1:' + number : null;
}

export async function probeDaemon(port, signal) {
  const origin = daemonOrigin(port);
  if (!origin) return false;
  const response = await fetch(origin + '/v1/presence', {
    method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
    redirect: 'error', referrerPolicy: 'no-referrer', targetAddressSpace: 'loopback', signal,
  });
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return false;
  // A different service can be listening here. Read only enough for the presence record.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 512) { await reader.cancel(); return false; }
      text += decoder.decode(value, {stream: true});
    }
  } finally {
    reader.releaseLock();
  }
  const record = JSON.parse(text + decoder.decode());
  return record?.service === 'nb1' && record.api_version === 'v1' && Object.keys(record).length === 2;
}
