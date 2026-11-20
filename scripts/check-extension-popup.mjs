// Exercise Chrome's toolbar bubble, which auto-sizes differently from a tab.
import assert from 'node:assert/strict';
import {on, once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const extension = path.resolve(process.argv[2] || 'dist/extension');
const profile = await mkdtemp(path.join(tmpdir(), 'nb1-popup-'));
const output = process.env.NIGHTLAB_ARTIFACT_DIR;
let context, socket;

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--remote-debugging-port=0', `--load-extension=${extension}`, `--disable-extensions-except=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  // Toolbar popups are not Playwright pages. Observe the native Chrome target
  // before openPopup() returns so a resize on startup cannot escape the test.
  const [port, endpoint] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await once(socket, 'open', {signal: AbortSignal.timeout(10000)});
  let id = 0, sessionId;
  async function waitForMessage(matches, description) {
    const signal = AbortSignal.timeout(10000);
    try {
      for await (const [event] of on(socket, 'message', {signal})) {
        const message = JSON.parse(event.data);
        if (matches(message)) return message;
      }
    } catch (error) {
      if (signal.aborted) throw new Error(`Timed out waiting for ${description}`, {cause: error});
      throw error;
    }
  }
  async function command(method, params) {
    const request = ++id;
    const response = waitForMessage(message => message.id === request, method);
    socket.send(JSON.stringify({id: request, method, params, sessionId}));
    const message = await response;
    assert.ifError(message.error);
    return message.result;
  }

  async function evaluate(fn, ...args) {
    const {result, exceptionDetails} = await command('Runtime.evaluate', {
      expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true
    });
    assert.ifError(exceptionDetails?.exception?.description || exceptionDetails?.text);
    return result.value;
  }

  function recordOpening() {
    window.openingFrames = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Toolbar never reached its first contentful paint')), 5000);
      const frames = [];
      function sample() {
        const button = document.querySelector('#set');
        // Chrome can expose an empty surface before there is a layout to paint.
        const box = button?.getBoundingClientRect();
        if (!document.hidden && innerWidth > 0 && innerHeight > 0 && box?.width > 0 && box.height > 0) {
          const label = document.createRange();
          label.selectNodeContents(button);
          frames.push({viewport: innerWidth, width: box.width, height: box.height,
            labelLines: label.getClientRects().length, font: getComputedStyle(button).fontSize});
        }
        if (frames.length && performance.getEntriesByName('first-contentful-paint').length) {
          clearTimeout(deadline);
          resolve(frames);
        } else {
          requestAnimationFrame(sample);
        }
      }
      requestAnimationFrame(sample);
    });
  }

  await command('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true,
    flatten: true, filter: [{type: 'other'}, {exclude: true}]});
  const attached = waitForMessage(message => message.method === 'Target.attachedToTarget', 'the Chrome toolbar target');
  await Promise.all([
    attached.then(async ({params}) => {
      sessionId = params.sessionId;
      await command('Page.enable');
      await command('Page.addScriptToEvaluateOnNewDocument', {source: `(${recordOpening})()`});
      await command('Runtime.runIfWaitingForDebugger');
    }),
    worker.evaluate(() => chrome.action.openPopup())
  ]);
  assert.equal(await evaluate(() => location.href), new URL('popup.html', worker.url()).href,
    'Chrome must open the packaged toolbar popup');
  const openingFrames = await evaluate(() => window.openingFrames);
  assert.ok(openingFrames?.length, 'the toolbar popup must contain visible controls at startup');
  if (output) {
    await mkdir(output, {recursive: true});
    await writeFile(path.join(output, 'extension-popup-first-visible.json'), JSON.stringify(openingFrames) + '\n');
  }
  for (const frame of openingFrames) {
    assert.equal(frame.viewport, 370, 'the first visible toolbar must have its designed width');
    assert.ok(frame.height >= 44, 'the first visible Set control must have a full-height hit target');
    assert.equal(frame.labelLines, 1, 'the first visible Set label must fit on one line');
    assert.equal(frame.font, '15px', 'the first visible Set label must have the normal font size');
  }

  async function screenshot(name) {
    if (!output) return;
    const {data} = await command('Page.captureScreenshot', {format: 'png'});
    await writeFile(path.join(output, `extension-popup-${name}.png`), Buffer.from(data, 'base64'));
  }

  function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
  }

  async function pointerAt(selector) {
    const point = await evaluate(async selector => {
      const element = document.querySelector(selector);
      element.scrollIntoView({block: 'nearest'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      if (!element.contains(document.elementFromPoint(x, y))) throw Error('Unreachable control: ' + selector);
      return {x, y};
    }, selector);
    await command('Input.dispatchMouseEvent', {type: 'mouseMoved', ...point});
    return point;
  }

  async function mouse(type, point) {
    await command('Input.dispatchMouseEvent', {
      type, ...point, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1
    });
  }

  async function click(selector) {
    const point = await pointerAt(selector);
    await mouse('mousePressed', point);
    await mouse('mouseReleased', point);
  }

  function buttonBox(selector) {
    const button = document.querySelector(selector);
    const {x, y, width, height} = button.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(button);
    const style = getComputedStyle(button);
    return {layout: {x, y, width, height, text: button.textContent,
      lines: range.getClientRects().length, font: style.font, fontSize: style.fontSize},
      disabled: button.disabled, active: button.matches(':active'), keyboardFocus: button.matches(':focus-visible')};
  }

  // Gate only the popup's RPC replies. Its real click handlers, DOM, CSS,
  // disabled state and toolbar scrolling are exercised without touching HID.
  await evaluate(() => {
    const connected = {connected: true, device: {productName: 'blink(1) mk2', vendorId: 10168, productId: 493}};
    chrome.runtime.sendMessage = ({op}) => {
      if (op === 'status') return Promise.resolve({ok: true, result: connected});
      if (op !== 'set' && op !== 'timer') throw Error('Unexpected test operation: ' + op);
      return new Promise(resolve => {
        window.finishPopupRequest = () => {
          if (op === 'timer') connected.timer = {deadline: Date.now() + 60000};
          resolve({ok: true, result: connected});
          delete window.finishPopupRequest;
        };
      });
    };
  });

  async function checkAction(selector, language) {
    const point = await pointerAt(selector);
    const before = await evaluate(buttonBox, selector);
    const disconnectPosition = () => document.querySelector('#disconnect').getBoundingClientRect().top + scrollY;
    const disconnectBefore = await evaluate(disconnectPosition);
    assert.equal(before.disabled, false, selector);
    await mouse('mousePressed', point);
    await evaluate(nextPaint);
    const down = await evaluate(buttonBox, selector);
    assert.equal(down.active, true, `${selector} must actually be pressed`);
    assert.deepEqual(down.layout, before.layout, `${language} ${selector} pressed`);
    if (selector === '#set') await screenshot(`${language}-pressed`);
    await mouse('mouseReleased', point);
    await evaluate(nextPaint);
    const pending = await evaluate(buttonBox, selector);
    assert.equal(pending.disabled, true, selector);
    assert.deepEqual(pending.layout, before.layout, `${language} ${selector} waiting`);
    const disconnectPending = await evaluate(disconnectPosition);
    assert.ok(Math.abs(disconnectPending - disconnectBefore) <= 1,
      `${language} ${selector}: feedback moved Disconnect by ${disconnectPending - disconnectBefore}px`);
    await evaluate(() => window.finishPopupRequest());
    await evaluate(nextPaint);
    const complete = await evaluate(buttonBox, selector);
    assert.equal(complete.disabled, false, selector);
    assert.deepEqual(complete.layout, before.layout, `${language} ${selector} complete`);
  }

  const measurements = [];
  const englishControls = new Map();
  for (const language of ['en', 'zh-CN']) {
    if (await evaluate(() => document.documentElement.lang) !== language) await click('#language');
    await evaluate(async language => {
      for (let i = 0; i < 100 && document.documentElement.lang !== language; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await document.fonts.ready;
      window.scrollTo(0, 0);
    }, language);
    await evaluate(nextPaint);
    measurements.push(await evaluate(() => {
      const text = document.createRange();
      text.selectNodeContents(document.querySelector('.brand span'));
      return {language: document.documentElement.lang, viewport: innerWidth, body: document.body.offsetWidth,
        content: document.documentElement.scrollWidth, wordmarkLines: text.getClientRects().length};
    }));
    assert.equal(await evaluate(() => getComputedStyle(document.body).fontSize), '15px',
      'Chrome extension pages apply their own body font size unless it is set explicitly');
    const boxes = new Map();
    for (const id of await evaluate(() => Array.from(document.querySelectorAll('button'), button => button.id))) {
      const {layout: box} = await evaluate(buttonBox, '#' + id);
      boxes.set(id, box);
      assert.equal(box.fontSize, '15px', `${language} #${id} font size`);
      assert.equal(box.lines, 1, `${language} #${id} label must fit`);
      assert.ok(box.height >= 44, `${language} #${id} must have a full-height hit target`);
      const geometry = [box.x, box.width, box.height];
      if (language === 'en') englishControls.set(id, geometry);
      else if (id !== 'disconnect') assert.deepEqual(geometry, englishControls.get(id), `#${id}: switching language must keep the control size and column`);
    }
    for (const [left, right] of [['open-options', 'refresh'], ['set', 'off'], ['start-timer', 'cancel-timer']]) {
      const first = boxes.get(left), second = boxes.get(right);
      assert.ok(Math.abs(first.width - second.width) <= 1 && first.y === second.y, `#${left} and #${right} should share a row equally`);
    }
    await screenshot(language);
    await click('#refresh');
    await click('#color');
    for (const type of ['keyDown', 'keyUp']) {
      await command('Input.dispatchKeyEvent', {type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
    }
    assert.equal((await evaluate(buttonBox, '#set')).keyboardFocus, true, 'Tab must reach the Set control');
    await checkAction('#set', language);
    await checkAction('#start-timer', language);
  }
  console.log(JSON.stringify(measurements));
  for (const [index, metrics] of measurements.entries()) {
    assert.equal(metrics.language, ['en', 'zh-CN'][index]);
    assert.equal(metrics.body, 370, 'toolbar must open at the designed width');
    assert.ok(metrics.viewport >= metrics.body && metrics.content <= metrics.viewport, 'popup must fit with no horizontal overflow');
    assert.equal(metrics.wordmarkLines, 1, 'nb1 must stay on one line');
  }
} finally {
  socket?.close();
  await context?.close();
  await rm(profile, {recursive: true, force: true});
}
