import assert from 'node:assert/strict';
import test from 'node:test';
import {daemonOrigin, probeDaemon} from '../src/web/daemon-presence.js';

const identity = {service:'nb1', api_version:'v1'};
const summary = devices => ({...identity, health:'ok', devices});
const {signal} = new AbortController();
const origin = 'http://127.0.0.1:8932';

test('checks accept only a single numeric loopback port', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw Error('Unexpected fetch'); });
  for (const value of ['', '0', '65536', '-1', '89.31', '1e3', '127.0.0.1:5885', 'example.com', '5885/other']) {
    assert.equal(daemonOrigin(value), null);
    assert.deepEqual(await probeDaemon(value, signal), {state:'unconfirmed'});
  }
  assert.equal(network.mock.callCount(), 0);
  assert.equal(daemonOrigin('1'), 'http://127.0.0.1:1');
  assert.equal(daemonOrigin('65535'), 'http://127.0.0.1:65535');
});

test('only after matching nb1 identity check status on the exact same port', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('Unexpected fetch'); });
  for (const devices of [null, {configured:0, online:0}, {configured:2, online:0}, {configured:2, online:1}]) {
    fetch.mock.mockImplementationOnce(() => Response.json(identity));
    fetch.mock.mockImplementationOnce(() => Response.json(summary(devices)), fetch.mock.callCount()+1);
    assert.deepEqual(await probeDaemon('8932', signal), {state:'healthy', devices});
    for (const [n,path] of ['/v1/presence', '/v1/service-status'].entries()) {
      assert.deepEqual(fetch.mock.calls.at(n-2).arguments, [origin+path, {
        method:'GET', mode:'cors', credentials:'omit', cache:'no-store', redirect:'error',
        referrerPolicy:'no-referrer', targetAddressSpace:'loopback', signal,
      }]);
    }
  }
});

test('denied, interrupted, unrelated or oversized identity ends the check', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('denied'); });
  for (const response of [
    Response.json(identity, {status:404}), new Response(JSON.stringify(identity)),
    Response.json({status:'ok'}), Response.json({...identity, service:'other'}),
    Response.json({...identity, api_version:'v2'}), Response.json({...identity, extra:true}),
    Response.json('x'.repeat(600)), Response.json(null), new Response('{', {headers:{'Content-Type':'application/json'}}),
  ]) {
    fetch.mock.mockImplementationOnce(() => response);
    const count = fetch.mock.callCount();
    assert.deepEqual(await probeDaemon('8932', signal), {state:'unconfirmed'});
    assert.equal(fetch.mock.callCount(), count+1);
  }
  assert.deepEqual(await probeDaemon('8932', signal), {state:'unconfirmed'});
  const abort = new AbortController();
  fetch.mock.mockImplementationOnce(() => { abort.abort(); return Response.json(identity); });
  const count = fetch.mock.callCount();
  assert.deepEqual(await probeDaemon('8932', abort.signal), {state:'present'});
  assert.equal(fetch.mock.callCount(), count+1);
});

test('unavailable, unauthenticated, malformed or oversized status preserves only presence', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('blocked'); });
  const rejected = [{}, null, {...summary(null),health:'unknown'}, {...summary(null),service:'other'},
    {...summary(null),id:'private'}, summary({configured:1,online:2}), summary({configured:2,online:-1}),
    summary({configured:1.5,online:1}), summary({configured:'2',online:1}), summary({configured:2}),
    summary({configured:2,online:1,devices:[]}), summary('x'.repeat(600))];
  for (const response of [...rejected.map(value=>Response.json(value)), Response.json({}, {status:404}), Response.json({}, {status:401}), null]) {
    fetch.mock.mockImplementationOnce(() => Response.json(identity));
    if (response) fetch.mock.mockImplementationOnce(() => response, fetch.mock.callCount()+1);
    const count = fetch.mock.callCount();
    assert.deepEqual(await probeDaemon('8932', signal), {state:'present'});
    assert.equal(fetch.mock.callCount(), count+2);
  }
});
