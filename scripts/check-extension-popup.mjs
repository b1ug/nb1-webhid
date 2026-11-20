// Exercise Chrome's toolbar bubble, which auto-sizes differently from a tab.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const extension = path.resolve(process.argv[2] || 'dist/extension');
const profile = await mkdtemp(path.join(tmpdir(), 'nb1-popup-'));
const output = process.env.NIGHTLAB_ARTIFACT_DIR;
let context;

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const cdp = await context.newCDPSession(context.pages()[0]);
  await worker.evaluate(() => chrome.action.openPopup());
  const {targetInfos} = await cdp.send('Target.getTargets');
  const popup = targetInfos.find(target => target.url === new URL('popup.html', worker.url()).href);
  assert.ok(popup, 'Chrome must open the packaged toolbar popup');
  // A toolbar popup is not a Playwright tab. Attach to its actual CDP target.
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId: popup.targetId});
  let id = 0;
  async function command(method, params) {
    const request = ++id;
    const response = once(cdp, 'Target.receivedMessageFromTarget', {signal: AbortSignal.timeout(10000)});
    await cdp.send('Target.sendMessageToTarget', {sessionId, message: JSON.stringify({id: request, method, params})});
    const [event] = await response;
    const message = JSON.parse(event.message);
    assert.equal(event.sessionId, sessionId);
    assert.equal(message.id, request);
    assert.ifError(message.error);
    return message.result;
  }

  async function measure(language) {
    if (document.documentElement.lang !== language) document.querySelector('#language').click();
    for (let i = 0; i < 100 && document.documentElement.lang !== language; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const wordmark = document.querySelector('.brand span');
    const text = document.createRange();
    text.selectNodeContents(wordmark);
    return {language: document.documentElement.lang, viewport: innerWidth, body: document.body.offsetWidth,
      content: document.documentElement.scrollWidth, wordmarkLines: text.getClientRects().length};
  }
  const measurements = [];
  for (const language of ['en', 'zh-CN']) {
    const evaluation = await command('Runtime.evaluate', {expression: `(${measure})(${JSON.stringify(language)})`,
      awaitPromise: true, returnByValue: true});
    assert.ifError(evaluation.exceptionDetails);
    measurements.push(evaluation.result.value);
    if (output) {
      await mkdir(output, {recursive: true});
      const {data} = await command('Page.captureScreenshot', {format: 'png'});
      await writeFile(path.join(output, `extension-popup-${language}.png`), Buffer.from(data, 'base64'));
    }
  }
  console.log(JSON.stringify(measurements));
  for (const [index, metrics] of measurements.entries()) {
    assert.equal(metrics.language, ['en', 'zh-CN'][index]);
    assert.equal(metrics.body, 370, 'toolbar must open at the designed width');
    assert.ok(metrics.viewport >= metrics.body && metrics.content <= metrics.viewport, 'popup must fit with no horizontal overflow');
    assert.equal(metrics.wordmarkLines, 1, 'nb1 must stay on one line');
  }
} finally {
  await context?.close();
  await rm(profile, {recursive: true, force: true});
}
