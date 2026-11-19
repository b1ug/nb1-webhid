import assert from 'node:assert/strict';
import test from 'node:test';
import {daemonOrigin, probeDaemon} from '../src/web/daemon-presence.js';

const identity = {service: 'nb1', api_version: 'v1'};

test('presence checks accept only a single numeric loopback port', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw Error('Unexpected fetch'); });
  for (const value of ['', '0', '65536', '-1', '89.31', '1e3', '127.0.0.1:8931', 'example.com', '8931/other']) {
    assert.equal(daemonOrigin(value), null);
    assert.equal(await probeDaemon(value), false);
  }
  assert.equal(network.mock.callCount(), 0);
  assert.equal(daemonOrigin('1'), 'http://127.0.0.1:1');
  assert.equal(daemonOrigin('65535'), 'http://127.0.0.1:65535');
});

test('only the presence identity from a successful JSON response confirms nb1', async t => {
  const {signal} = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', () => Response.json(identity));
  assert.equal(await probeDaemon('8932', signal), true);
  assert.deepEqual(fetch.mock.calls[0].arguments, ['http://127.0.0.1:8932/v1/presence', {
    method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
    redirect: 'error', referrerPolicy: 'no-referrer', targetAddressSpace: 'loopback', signal,
  }]);
  for (const response of [
    Response.json(identity, {status: 404}), new Response(JSON.stringify(identity)),
    Response.json({status:'ok'}), Response.json({...identity, service:'other'}),
    Response.json({...identity, api_version:'v2'}), Response.json({...identity, extra:true}),
    Response.json('x'.repeat(600)), Response.json(null),
  ]) {
    fetch.mock.mockImplementationOnce(() => response);
    assert.equal(await probeDaemon('8932', signal), false);
  }
});
