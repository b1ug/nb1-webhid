// Integrated browser presentation checks. The HTTP server is read-only and
// ephemeral; navigator.hid is replaced before application scripts execute.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.env.NIGHTLAB_ARTIFACT_DIR || path.join(root, 'artifacts/nightlab'));
await mkdir(output, {recursive: true});
const mount = process.env.NB1_BROWSER_TEST_MOUNT || '/nested/browser/';
assert.ok(/^\/(?:[a-zA-Z0-9_-]+\/)+$/.test(mount), 'test mount must be a bounded project subpath');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.wasm':'application/wasm', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.webp':'image/webp'};
const requests = [], errors = [], outside = [], failed = [], captures = [], checks = [];
const server = http.createServer(async (request, response) => {
  requests.push({method: request.method, url: request.url});
  if (request.method !== 'GET') { response.writeHead(405).end(); return; }
  let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname.startsWith(mount)) pathname = pathname.slice(mount.length);
  const base = path.join(root, 'dist/web');
  let target = path.resolve(base, './' + pathname);
  if (pathname === '/' || pathname === '') target = path.join(base, 'index.html');
  if (!target.startsWith(base + path.sep)) { response.writeHead(403).end(); return; }
  try { const bytes = await readFile(target); response.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'}).end(bytes); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({args:['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport:{width:1366,height:900}, reducedMotion:'reduce'});
await context.addInitScript(() => {
  const calls = {picker:[], opens:0, closes:0, reports:[], fail:false};
  window.__softwareHID = calls;
  const device = {vendorId:0x27b8, productId:0x01ed, productName:'Software test fixture', opened:false,
    async open() { calls.opens++; if(calls.failOpen)throw Error('Fixture open failed'); this.opened=true; },
    async close() { calls.closes++; this.opened=false; },
    async sendFeatureReport(id, data) { calls.reports.push({id,bytes:[...data]}); if(calls.fail) throw Error('Software test lost acknowledgement'); }};
  Object.defineProperty(navigator, 'hid', {configurable:true, value:{addEventListener(){}, async requestDevice(options){calls.picker.push(options); return [device];}}});
  window.__frames=[];
  window.addEventListener('nb1-screen-preview', event => window.__frames.push(structuredClone(event.detail)));
  window.__accepted=[];
  window.addEventListener('nb1-command-accepted', event => window.__accepted.push(structuredClone(event.detail)));
  window.__gl=0;
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')window.__gl++;return original.call(this,type,...args);};
});
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== base) { outside.push(url.href); await route.abort(); return; }
  await route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if(response.status()>=400)failed.push(response.status()+' '+response.url()); });
const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const stage = () => page.locator('[data-light-stage]').evaluate(node => ({state:node.dataset.screenPreviewState, elapsed:+node.dataset.screenPreviewElapsed, colors:[...node.querySelectorAll('[data-studio-color]')].map(output=>output.textContent)}));
async function shot(name, fullPage=false) { await page.screenshot({path:path.join(output,name),fullPage}); captures.push(name); }
async function waitReady(flat=false) {
  await page.waitForFunction(flat=>document.querySelector('[data-light-stage]')?.dataset.threeState===(flat?'static':'ready'),flat);
  await page.waitForFunction(()=>!document.querySelector('#preview').disabled);
}
async function daemonDiagnostics() {
  await page.goto(base + mount + '?view=faces', {waitUntil:'networkidle'});
  await waitReady(true);
  const service = 'http://127.0.0.1:49386';
  const fixture = service + '/v1/*';
  const calls = [];
  let presence = true;
  let devices = {configured:2, online:1};
  let summaryBlocked = false;
  await page.route(fixture, route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    assert.equal(request.method(), 'GET');
    calls.push(pathname);
    let record = {service:'nb1', api_version:'v1'};
    if (pathname === '/v1/presence') {
      if (!presence) record = {status:'ok'};
    } else {
      assert.equal(pathname, '/v1/service-status');
      if (summaryBlocked) return route.abort();
      record = {...record, health:'ok', devices};
    }
    return route.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':base},body:JSON.stringify(record)});
  });
  const select = page.locator('#daemon-service'), port = page.locator('#daemon-port');
  const check = page.locator('[data-daemon-check]'), debuggerLink = page.locator('#daemon-debugger');
  const result = page.locator('#daemon-result');
  const expectText = text => page.waitForFunction(text=>document.querySelector('#daemon-result').textContent.includes(text), text);
  try {
    await page.locator('#connect').click();
    await page.locator('#ownership').check();
    await page.evaluate(() => { window.__softwareHID.failOpen = true; });
    await page.locator('#connect').click();
    await page.waitForSelector('#open-daemon-help:not([hidden])');
    const hidError = await page.locator('#status').textContent();
    assert.match(hidError, /could not open/);
    assert.equal(await select.inputValue(), '5885');
    assert.equal(await port.isVisible(), false);
    assert.equal(await debuggerLink.getAttribute('href'), 'http://127.0.0.1:5885/demo/');
    await select.selectOption('custom');
    await port.fill('65536');
    await check.click();
    assert.match(await result.textContent(), /1 to 65535/);
    assert.equal(await debuggerLink.getAttribute('href'), null);
    await port.fill('49386');
    assert.equal(await page.locator('#daemon-endpoint').textContent(), service);
    assert.deepEqual(calls, []);
    await port.press('Enter'); await expectText('1 online / 2 configured');
    assert.deepEqual(calls, ['/v1/presence','/v1/service-status']);
    assert.equal(await select.inputValue(), '49386');
    assert.equal(await debuggerLink.getAttribute('href'), service+'/demo/');
    assert.equal(await debuggerLink.getAttribute('target'), '_blank');
    assert.equal(await page.locator('#status').textContent(), hidError);
    assert.equal(await page.locator('#play').isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.__softwareHID.reports), []);
    await page.locator('#daemon-details').screenshot({path:path.join(output,'daemon-status-en.png')});
    await page.locator('#language').click(); await expectText('1 台在线，共配置 2 台');
    await page.setViewportSize({width:320,height:740});
    const controls = await select.boundingBox();
    assert.ok(controls.x>=0 && controls.x+controls.width<=320);
    await page.locator('#daemon-details').screenshot({path:path.join(output,'daemon-status-zh-320.png')});
    await page.setViewportSize({width:1366,height:900});
    await page.locator('#language').click();
    devices = {configured:2,online:0}; await check.click(); await expectText('0 online / 2 configured');
    devices = {configured:0,online:0}; await check.click(); await expectText('No devices configured');
    devices = null; await check.click(); await expectText('Device counts unavailable');
    summaryBlocked = true; await check.click(); await expectText('Daemon present. Health and device counts unavailable');
    presence = false; await check.click(); await expectText('Could not confirm');
    assert.deepEqual(calls.slice(-3), ['/v1/presence','/v1/service-status','/v1/presence']);
    const total = calls.length;
    await page.reload({waitUntil:'networkidle'}); await waitReady(true);
    await page.locator('#connection-options > summary').click();
    assert.equal(await select.inputValue(), '49386');
    assert.equal(await result.textContent(), '');
    const key = 'nb1.webhid.local-service';
    const savedChoice = () => page.evaluate(key=>JSON.parse(localStorage.getItem(key)).choice, key);
    await select.selectOption('5885');
    assert.equal(await savedChoice(), 'default');
    assert.equal(await page.locator('#daemon-endpoint').textContent(), 'http://127.0.0.1:5885');
    await select.selectOption('49386');
    assert.equal(await savedChoice(), '49386');
    assert.equal(await debuggerLink.getAttribute('href'), service+'/demo/');
    assert.equal(calls.length, total);

    // Preserve every saved legacy port: the old schema did not record how it was selected.
    for (const [prefs, expected, custom] of [
      [{port:'8931', recent:['49386']}, 'custom', '8931'],
      [{recent:['49386']}, '5885', null],
      [{port:'49386', recent:['49386']}, '49386', null],
      [{port:'8932', recent:[]}, 'custom', '8932'],
      [{choice:'default', recent:['49386']}, '5885', null],
      [{choice:'8931', recent:[]}, 'custom', '8931'],
      [{choice:'5885', recent:[]}, 'custom', '5885'],
    ]) {
      await page.evaluate(([key,prefs])=>localStorage.setItem(key,JSON.stringify(prefs)),[key,prefs]);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#daemon-service option[value="custom"]') &&
        document.querySelector('#daemon-endpoint').textContent !== '');
      assert.equal(await select.inputValue(), expected);
      if (custom) assert.equal(await port.inputValue(), custom);
      assert.equal(await result.textContent(), '');
    }
    assert.equal(calls.length, total);
    checks.push('One user-selected loopback service, passive selection/reload, cached counts, legacy presence, unknown responses and EN/ZH mobile feedback; no USB commands');
  } finally {
    await page.unroute(fixture);
  }
}

async function cycleDefaults() {
  await page.goto(base+mount+'?view=faces',{waitUntil:'networkidle'});await waitReady(true);
  await page.evaluate(()=>{window.__cycleCompiles=[];const compile=window.nb1Go.compileRequest;window.nb1Go.compileRequest=raw=>{window.__cycleCompiles.push(JSON.parse(raw));return compile(raw);};});
  const looping=['blink','breathe','pulse','alternate','orbit','rainbow'];
  for(const kind of looping){
    await page.locator(`#presets [data-kind="${kind}"]`).click();
    assert.equal(await page.locator('#param-cycles').inputValue(),'3');
    assert.equal(JSON.parse(await page.locator('#request').inputValue()).action.cycles,3);
    await page.locator('#preview').click();
    await page.waitForFunction(kind=>window.__cycleCompiles.at(-1)?.action.kind===kind&&document.querySelector('[data-light-stage]').dataset.screenPreviewState==='playing',kind);
    assert.equal(await page.evaluate(()=>window.__cycleCompiles.at(-1).action.cycles),3);
    assert.equal(JSON.parse(await page.locator('#compiled').textContent()).repeat,3);
  }
  checks.push('All six fresh looping drafts show three cycles and send three to the real Go Preview compiler and its existing canonical three-cycle repeat');
  for(const kind of looping){
    await page.locator(`#presets [data-kind="${kind}"]`).click();await page.locator('#param-cycles').fill('2');
    await page.locator('#presets [data-kind="set"]').click();await page.locator(`#presets [data-kind="${kind}"]`).click();
    assert.equal(await page.locator('#param-cycles').inputValue(),'2');
    const raw=await page.locator('#request').inputValue();await page.locator('#language').click();assert.equal(await page.locator('#request').inputValue(),raw);await page.locator('#language').click();
  }
  checks.push('Manual two-cycle drafts survive effect switches and both languages without rewriting authored JSON');
  const authored=JSON.stringify({sequence:{timing:'serial',steps:[{targets:[{led:0,color:'#123456'}],fade_ms:0,hold_ms:100}],repeat:1,on_finish:'hold'}});
  await page.locator('#file').setInputFiles({name:'one-repeat.json',mimeType:'application/json',buffer:Buffer.from(authored)});
  await page.waitForFunction(raw=>document.querySelector('#request').value===raw,authored);await page.locator('#preview').click();
  await page.waitForFunction(()=>window.__cycleCompiles.at(-1)?.sequence?.repeat===1&&['playing','completed'].includes(document.querySelector('[data-light-stage]').dataset.screenPreviewState));
  assert.equal(JSON.parse(await page.locator('#compiled').textContent()).repeat,1);assert.equal(await page.locator('#request').inputValue(),authored);
  checks.push('An imported authored Sequence keeps repeat one and its exact JSON through Preview');
  assert.deepEqual(await page.evaluate(()=>({picker:window.__softwareHID.picker,opens:window.__softwareHID.opens,reports:window.__softwareHID.reports})),{picker:[],opens:0,reports:[]});
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);
  await writeFile(path.join(output,'cycles.json'),JSON.stringify({status:'PASS',base,hardware_access:false,daemon_access:false,checks,errors,outside,failed},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',checks:checks.length,output}));
}
async function usability() {
  await page.goto(base+mount,{waitUntil:'networkidle'});await waitReady();
  assert.match(await page.locator('#play-state').textContent(),/Connect your blink/);
  assert.equal(await page.locator('#play-state a').getAttribute('href'),'#connect');
  assert.equal(await page.locator('#preview').getAttribute('title'),null);
  await page.locator('#connect').click();await page.locator('#ownership').check();await page.locator('#connect').click();
  await page.waitForFunction(()=>!document.querySelector('#play').disabled);
  await page.locator('#param-led label').filter({has:page.locator('input[value="separate"]')}).click();
  await page.locator('#color-input-0').fill('#123456');await page.locator('#color-input-1').fill('blue');
  await page.waitForFunction(()=>document.querySelector('.composer').dataset.colorCount==='2');
  assert.equal(await page.locator('.composer').getAttribute('data-color-count'),'2');
  assert.deepEqual(await page.locator('#param-led input').evaluateAll(nodes=>nodes.map(node=>node.value)),['0','separate','1','2']);
  assert.deepEqual(JSON.parse(await page.locator('#request').inputValue()),{sequence:{timing:'serial',steps:[{targets:[{led:1,color:'#123456'}],fade_ms:0,hold_ms:0},{targets:[{led:2,color:'blue'}],fade_ms:0,hold_ms:0}],repeat:1,on_finish:'hold'}});
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#play-state').dataset.state==='completed');
  assert.equal(await page.locator('#preview-details').evaluate(node=>node.open),false);
  assert.equal((await stage()).state,'idle');
  let writes=await page.evaluate(()=>window.__softwareHID.reports.filter(report=>report.bytes[0]===0x63).map(report=>report.bytes));
  assert.deepEqual(writes.map(bytes=>[bytes[6],...bytes.slice(1,4)]),[[1,0x12,0x34,0x56],[2,0,0,255]]);
  assert.deepEqual((await stage()).colors,['#123456','#0000ff']);
  checks.push('Direct Play without Screen preview sends exactly two ordered Solid targets, not a new Action/API');
  await page.locator('#advanced > summary').click();
  const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(exported.sequence.steps.map(step=>step.targets[0]),[{led:1,color:'#123456'},{led:2,color:'#0000ff'}]);
  await page.locator('#presets [data-kind="breathe"]').click();await page.locator('#param-period_ms').fill('7770');await page.locator('#param-cycles').fill('3');
  await page.locator('#param-led label').filter({has:page.locator('input[value="2"]')}).click();
  const breathe=await page.locator('#request').inputValue();await page.locator('#presets [data-kind="breathe"]').click();assert.equal(await page.locator('#request').inputValue(),breathe);
  await page.locator('#presets [data-kind="set"]').click();assert.equal(await page.locator('#color-input-0').inputValue(),'#123456');assert.equal(await page.locator('#color-input-1').inputValue(),'blue');
  await page.locator('#presets [data-kind="breathe"]').click();assert.equal(await page.locator('#param-period_ms').inputValue(),'7770');assert.equal(await page.locator('#param-cycles').inputValue(),'3');assert.equal(await page.locator('#param-led input:checked').inputValue(),'2');
  checks.push('Export preserves paired canonical Sequence; each Action draft and target survive switches and same-effect reselection');
  await page.locator('#param-cycles').fill('1');await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.screenPreviewState==='playing');
  await page.locator('#presets [data-kind="breathe"]').click();assert.equal((await stage()).state,'playing');
  await page.evaluate(()=>{window.__originalCompile=window.nb1Go.compileRequest;window.nb1Go.compileRequest=()=>JSON.stringify({ok:false,error:{code:'invalid_input',message:'Software validation rejection'}});});
  const before=await page.evaluate(()=>window.__softwareHID.reports.length);await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Software validation rejection'));
  assert.equal((await stage()).state,'playing');assert.equal(await page.evaluate(()=>window.__softwareHID.reports.length),before);
  await page.evaluate(()=>{window.nb1Go.compileRequest=window.__originalCompile;});
  await page.locator('[data-preview-control="stop"]').click();
  await page.locator('#presets [data-kind="set"]').click();
  await page.evaluate(()=>{document.querySelector('#play').click();const input=document.querySelector('#color-input-0');input.value='#654321';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('draft changed while compiling'));
  assert.equal(await page.evaluate(()=>window.__softwareHID.reports.length),before);
  await page.locator('#color-input-1').fill('not-a-color');await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
  assert.equal(await page.evaluate(()=>window.__softwareHID.reports.length),before);
  checks.push('Validation rejection and same-effect reselection preserve screen playback; stale or invalid dual input sends no reports');
  await page.locator('#color-input-0').fill('#123456');await page.locator('#color-input-1').fill('#abcdef');
  const raw=await page.locator('#request').inputValue();
  for(const width of [1366,430,390,320]){await page.setViewportSize({width,height:900});for(const language of ['en','zh-CN']){
    if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#language').click();await frame();
    await page.waitForFunction(()=>document.querySelector('#color-result-0').textContent==='#123456'&&document.querySelector('#color-result-1').textContent==='#abcdef'&&document.querySelector('#color-picker-0').value==='#123456'&&document.querySelector('#color-picker-1').value==='#abcdef');
    assert.equal(await page.locator('#request').inputValue(),raw);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.match(await page.locator('#param-led').textContent(),/LED 1 · blink\(1\)/);assert.match(await page.locator('#param-led').textContent(),/LED 2 · ThingM/);
    assert.equal(await page.locator('#stop').getAttribute('aria-label'),language==='en'?'Stop device playback':'停止设备播放');
    assert.equal(await page.evaluate(()=>Boolean(document.querySelector('.composer').compareDocumentPosition(document.querySelector('.studio-sidebar'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.equal(await page.locator('#preview').boundingBox().then(box=>box.height>=44),true);assert.equal(await page.locator('#play').boundingBox().then(box=>box.height>=44),true);
    if(width<=430)assert.equal(await page.locator('[data-composer-action-label]').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),true);
    await page.locator('.composer').scrollIntoViewIfNeeded();await shot(`solid-${width}-${language}.png`);
  }}
  checks.push('Paired Solid layout is bilingual, draft-preserving and bounded at 1366/430/390/320');
  if(await page.locator('html').getAttribute('lang')!=='en')await page.locator('#language').click();
  await page.evaluate(()=>window.__softwareHID.fail=true);await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('unknown'));
  const uncertain=await page.evaluate(()=>window.__softwareHID.reports.length);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.__softwareHID.reports.length),uncertain);
  await page.locator('#disconnect').click();await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Not connected');
  checks.push('Unknown HID result is not retried; explicit disconnect retains the existing recovery boundary');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);
  await writeFile(path.join(output,'usability.json'),JSON.stringify({status:'PASS',base,hardware_access:false,checks,captures,errors,outside,failed},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',checks:checks.length,captures:captures.length,output}));
}
async function colorSets() {
  await page.goto(base+mount+'?view=faces',{waitUntil:'networkidle'});await waitReady(true);
  await page.waitForFunction(()=>window.NB1ColorSets?.sets.length===8&&document.querySelector('#palette-0')?.children.length===9);
  const catalog=await page.evaluate(()=>window.NB1ColorSets.sets);
  const commonColors=await page.evaluate(()=>window.NB1ColorSets.get('essentials').colors);
  assert.ok(catalog.every(set=>set.colors.length===8));assert.equal(catalog.flatMap(set=>set.colors).length,64);
  assert.equal(await page.locator('.color-set-grid [data-color-set]').count(),8);assert.equal(await page.locator('#color-set-common').evaluate(node=>node.closest('.color-set-grid')),null);
  await page.locator('#color-sets > summary').click();
  assert.equal(await page.locator('#color-set-common').boundingBox().then(box=>box.height>=44),true);assert.equal(await page.locator('#color-set-sequence').isVisible(),false);
  const initialRaw=await page.locator('#request').inputValue();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('nb1-color-set-sequence',{detail:{id:'essentials'}})));assert.equal(await page.locator('#request').inputValue(),initialRaw);assert.equal(await page.locator('#advanced').evaluate(node=>node.open),false);
  await page.locator('#color-sets > summary').click();
  const comparatorGeometry=[];
  const compileResults=await page.evaluate(()=>window.NB1ColorSets.sets.filter(set=>set.id!=='essentials').map(set=>({id:set.id,response:JSON.parse(window.nb1Go.compileRequest(JSON.stringify({sequence:window.NB1ColorSets.sequence(set.id)})))})));
  for(const {id,response} of compileResults){const colors=catalog.find(set=>set.id===id).colors;assert.equal(response.ok,true,id);assert.equal(response.result.sequence.repeat,3);assert.equal(response.result.sequence.steps.length,colors.length);assert.equal(response.result.nominal_duration_ms,1010*colors.length*3);assert.equal(response.result.sequence.on_finish,'off');assert.deepEqual(response.result.sequence.steps.map(step=>step.targets[0].color),colors);}
  checks.push('Exactly eight eight-color themes compile through actual pinned Go WASM as eight Steps, nominal24240ms, repeat three, finish off; nine common utility colors cannot create a Sequence');
  if(process.argv.includes('--catalog-only')){
    await page.setViewportSize({width:320,height:900});await page.locator('#color-sets > summary').click();await frame();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('[data-color-set]').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1&&node.getBoundingClientRect().height>=44)),true);
    assert.deepEqual(await page.locator('[data-color-set] .color-set-label').allTextContents(),catalog.map(set=>set.label.en));
    await page.locator('#color-sets').scrollIntoViewIfNeeded();await shot('final-catalog-320-en.png');
    assert.deepEqual(await page.evaluate(()=>({picker:window.__softwareHID.picker,opens:window.__softwareHID.opens,reports:window.__softwareHID.reports})),{picker:[],opens:0,reports:[]});
    assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);checks.push('Final catalog labels fit at 320px with no implicit HID access');
    await writeFile(path.join(output,'catalog-only.json'),JSON.stringify({status:'PASS',captured_at:new Date().toISOString(),hardware_access:false,daemon_access:false,real_permission_ui:false,checks,captures,compiler_results:compileResults,errors,outside,failed},null,2)+'\n');
    console.log(JSON.stringify({status:'PASS',checks:checks.length,captures:captures.length,output}));return;
  }
  await page.evaluate(()=>{window.__colorCompiles=[];const compile=window.nb1Go.compileRequest;window.nb1Go.compileRequest=raw=>{window.__colorCompiles.push(JSON.parse(raw));return compile(raw);};});
  await page.locator('#presets [data-kind="breathe"]').click();await page.locator('#param-period_ms').fill('7770');await page.locator('#param-cycles').fill('2');
  await page.locator('#param-led label').filter({has:page.locator('input[value="2"]')}).click();
  await page.locator('#param-on_finish label').filter({has:page.locator('input[value="hold"]')}).click();
  await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.screenPreviewState==='playing');
  const before=await page.locator('#request').inputValue(),compiledBefore=await page.locator('#compiled').textContent();
  await page.locator('#color-sets > summary').click();await page.locator('[data-color-set="neon"]').click();await frame();
  assert.equal(await page.locator('#request').inputValue(),before);assert.equal(await page.locator('#compiled').textContent(),compiledBefore);assert.equal((await stage()).state,'playing');
  assert.deepEqual(await page.locator('#palette-0 button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),catalog.find(set=>set.id==='neon').colors);
  assert.equal(await page.locator('#color-set-pair').isVisible(),false);
  await page.locator('#color-set-common').click();assert.equal(await page.evaluate(()=>window.NB1ColorSets.selectedId),'essentials');assert.equal(await page.locator('#color-set-sequence').isVisible(),false);
  assert.deepEqual(await page.locator('#palette-0 button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),commonColors);
  assert.equal(await page.locator('#request').inputValue(),before);assert.equal(await page.locator('#compiled').textContent(),compiledBefore);assert.equal((await stage()).state,'playing');
  await page.locator('[data-color-set="neon"]').click();assert.equal(await page.locator('#color-set-sequence').isVisible(),true);
  await page.locator('#color-set-compare > summary').click();await frame();
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#color-set-compare > summary')),true);
  assert.equal(await page.locator('#color-set-compare-table tbody tr').count(),8);assert.equal(await page.locator('#color-set-compare-table thead th').count(),9);
  assert.equal(await page.locator('#color-set-compare-table .color-set-compare-chip').count(),64);
  assert.equal(await page.locator('#color-set-compare-table button, #color-set-compare-table input, #color-set-compare-table a').count(),0);
  await page.locator('#color-set-compare-table td').first().click();
  assert.equal(await page.locator('#request').inputValue(),before);assert.equal(await page.locator('#compiled').textContent(),compiledBefore);assert.equal((await stage()).state,'playing');
  assert.equal(await page.locator('#color-set-compare-scroll').getAttribute('tabindex'),'0');
  await page.locator('#color-set-compare-scroll').focus();await page.keyboard.press('ArrowRight');await frame();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'color-set-compare-scroll');assert.ok(await page.locator('#color-set-compare-scroll').evaluate(node=>node.scrollLeft>0));
  await page.locator('#color-set-compare-scroll').evaluate(node=>node.scrollLeft=0);assert.equal(await page.locator('#request').inputValue(),before);assert.equal((await stage()).state,'playing');
  await page.locator('#color-set-compare > summary').click();
  checks.push('Browsing and the read-only eight-row/eight-hue comparator preserve authored draft, compiled result and ongoing Screen preview');
  await page.locator('#palette-0 button').nth(1).click();
  let action=JSON.parse(await page.locator('#request').inputValue()).action;
  assert.equal(action.color,catalog.find(set=>set.id==='neon').colors[1]);assert.equal(action.cycles,2);assert.equal(action.period_ms,7770);assert.equal(action.led,2);assert.equal(action.on_finish,'hold');assert.equal((await stage()).state,'idle');
  await page.locator('#presets [data-kind="orbit"]').click();await page.locator('#param-period_ms').fill('5150');await page.locator('#param-cycles').fill('2');
  await page.locator('#param-leds label').filter({has:page.locator('input[value="2,1"]')}).click();
  await page.locator('#param-on_finish label').filter({has:page.locator('input[value="hold"]')}).click();
  await page.locator('#color-set-pair').click();
  action=JSON.parse(await page.locator('#request').inputValue()).action;
  assert.deepEqual(action.colors,catalog.find(set=>set.id==='neon').pair);assert.deepEqual(action.leds,[2,1]);assert.equal(action.period_ms,5150);assert.equal(action.cycles,2);assert.equal(action.on_finish,'hold');
  await page.locator('#color-set-common').click();await page.locator('#color-set-pair').click();action=JSON.parse(await page.locator('#request').inputValue()).action;assert.deepEqual(action.colors,['#ff0000','#0000ff']);assert.deepEqual(action.leds,[2,1]);assert.equal(action.period_ms,5150);assert.equal(action.cycles,2);
  await page.locator('[data-color-set="neon"]').click();await page.locator('#color-set-pair').click();
  for(const kind of ['alternate','orbit']){await page.locator(`#presets [data-kind="${kind}"]`).click();assert.equal(await page.evaluate(()=>window.NB1ColorSets.selectedId),'neon');await page.locator('#color-set-pair').click();assert.deepEqual(JSON.parse(await page.locator('#request').inputValue()).action.colors,catalog.find(set=>set.id==='neon').pair);}
  await page.locator('#presets [data-kind="set"]').click();await page.locator('#param-led label').filter({has:page.locator('input[value="separate"]')}).click();await page.locator('#color-set-pair').click();
  const paired=JSON.parse(await page.locator('#request').inputValue()).sequence;
  assert.deepEqual(paired.steps.map(step=>step.targets[0]),catalog.find(set=>set.id==='neon').pair.map((color,index)=>({led:index+1,color})));
  checks.push('Single swatches preserve timing/cycles/target; explicit pair preserves Alternate/Orbit ordering and maps Solid to fixed LED 1 / LED 2');
  for(const kind of ['off','rainbow']){await page.locator(`#presets [data-kind="${kind}"]`).click();await frame();assert.equal(await page.locator('#color-sets').isVisible(),false);assert.equal(await page.evaluate(()=>window.NB1ColorSets.selectedId),'neon');}
  await page.locator('#presets [data-kind="set"]').click();await page.locator('[data-color-set="tide"]').click();
  const raw=await page.locator('#request').inputValue();
  for(const width of [1366,390,320]){await page.setViewportSize({width,height:900});for(const language of ['en','zh-CN']){
    if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#language').click();await frame();
    await page.waitForFunction(colors=>document.querySelector('#color-result-0').textContent===colors[0]&&document.querySelector('#color-result-1').textContent===colors[1]&&document.querySelector('#color-picker-0').value===colors[0]&&document.querySelector('#color-picker-1').value===colors[1],catalog.find(set=>set.id==='neon').pair);
    assert.equal(await page.locator('#request').inputValue(),raw);assert.equal(await page.evaluate(()=>window.NB1ColorSets.selectedId),'tide');assert.equal(await page.locator('[data-color-set="tide"]').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('.color-set-grid [data-color-set]').count(),8);assert.match(await page.locator('#color-set-common').textContent(),language==='en'?/Common colors/:/常用颜色/);
    assert.deepEqual(await page.locator('.color-set-grid .color-set-label').allTextContents(),catalog.map(set=>set.label[language]));
    assert.equal(await page.locator('#color-sets > summary').boundingBox().then(box=>box.height>=44),true);assert.equal(await page.locator('#color-set-pair').boundingBox().then(box=>box.height>=44),true);
    assert.equal(await page.locator('[data-color-set]').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44&&node.scrollWidth<=node.clientWidth+1)),true);
    assert.equal(await page.locator('[data-color-set]').evaluateAll(nodes=>nodes.every(node=>{const style=getComputedStyle(node),content=node.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);return Math.abs(node.querySelector('.color-set-strip').getBoundingClientRect().width-content)<1;})),true,'Every family strip must span its card content width');
    await page.locator('#color-sets').scrollIntoViewIfNeeded();await shot(`color-sets-${width}-${language}.png`);
    await page.locator('#color-set-compare > summary').click();await frame();
    assert.match(await page.locator('#color-set-compare > summary').textContent(),language==='en'?/Compare by hue/:/按色系对比/);
    assert.deepEqual(await page.locator('#color-set-compare-table tbody th').allTextContents(),catalog.map(set=>set.label[language]));
    assert.equal(await page.locator('#request').inputValue(),raw);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('#color-set-compare-scroll').evaluate(node=>node.getBoundingClientRect().width<=innerWidth),true);
    for(const color of new Set(catalog.filter(set=>set.id!=='essentials').flatMap(set=>set.colors)))assert.ok((await page.locator('#color-set-compare-table').textContent()).includes(color));
    await page.locator('#color-set-compare').scrollIntoViewIfNeeded();await shot(`compare-${width}-${language}.png`);
    await page.locator('#color-set-compare-scroll').evaluate(node=>{const heading=node.querySelector('thead th:nth-child(4)'),fixed=node.querySelector('thead th');node.scrollLeft=heading.offsetLeft-fixed.getBoundingClientRect().width;});await frame();
    const geometry=await page.locator('#color-set-compare-scroll').evaluate(node=>{const viewport=node.getBoundingClientRect(),fixed=node.querySelector('tbody th').getBoundingClientRect(),chip=node.querySelector('[data-color-set-compare-hex="#c0a008"]').getBoundingClientRect();return {viewportWidth:viewport.width,stickyWidth:fixed.width,availableWidth:viewport.right-fixed.right,chipWidth:chip.width,chipLeft:chip.left,chipRight:chip.right,visibleLeft:fixed.right,visibleRight:viewport.right};});
    comparatorGeometry.push({width,language,...geometry});await writeFile(path.join(output,'compare-geometry.json'),JSON.stringify(comparatorGeometry,null,2)+'\n');
    assert.ok(geometry.chipLeft>=geometry.visibleLeft-1&&geometry.chipRight<=geometry.visibleRight+1,`Yellow chip must fit beside sticky names: ${JSON.stringify(geometry)}`);
    assert.equal(await page.locator('#request').inputValue(),raw);await shot(`compare-yellow-${width}-${language}.png`);
    await page.locator('#color-set-compare-scroll').evaluate(node=>node.scrollLeft=0);await page.locator('#color-set-compare > summary').click();
  }}
  checks.push('Selected family survives Action/field/language rerenders; bilingual 1366/390/320 layouts have no page overflow and keep 44px chooser actions');
  if(await page.locator('html').getAttribute('lang')!=='en')await page.locator('#language').click();
  await page.locator('#color-set-sequence').focus();await page.locator('#color-set-sequence').press('Enter');await frame();
  const generated=JSON.parse(await page.locator('#request').inputValue());
  assert.deepEqual(generated.sequence,await page.evaluate(()=>window.NB1ColorSets.sequence('tide')));assert.equal(await page.locator('#advanced').evaluate(node=>node.open),true);assert.equal(await page.locator('#action-fields').isVisible(),false);assert.equal((await stage()).state,'idle');
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#advanced > summary')),true,'Keyboard template creation must move focus to its visible editor disclosure');
  assert.deepEqual(await page.evaluate(()=>({picker:window.__softwareHID.picker,opens:window.__softwareHID.opens,reports:window.__softwareHID.reports})),{picker:[],opens:0,reports:[]});
  const authored=JSON.stringify({sequence:{timing:'serial',steps:[{targets:[{led:0,color:'#123456'}],fade_ms:0,hold_ms:100}],repeat:1,on_finish:'hold'}});
  await page.locator('#file').setInputFiles({name:'one-repeat.json',mimeType:'application/json',buffer:Buffer.from(authored)});await page.waitForFunction(raw=>document.querySelector('#request').value===raw,authored);
  await page.locator('#preview').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#compiled').textContent).repeat===1);assert.equal(await page.locator('#request').inputValue(),authored);
  checks.push('Keyboard Create Sequence fills editable JSON and focuses its open Advanced summary; no save/preview/device access occurs, and imported repeat one remains unchanged');
  await page.locator('#presets [data-kind="set"]').click();await page.locator('[data-color-set="aurora"]').click();await page.locator('#color-set-pair').click();
  const aurora=catalog.find(set=>set.id==='aurora');assert.notDeepEqual(aurora.pair,aurora.colors.slice(0,2));
  assert.deepEqual(JSON.parse(await page.locator('#request').inputValue()).sequence.steps.map(step=>step.targets[0].color),aurora.pair);
  await page.locator('#connect').click();await page.locator('#ownership').check();await page.locator('#connect').click();await page.waitForFunction(()=>!document.querySelector('#play').disabled);
  const compileCount=await page.evaluate(()=>window.__colorCompiles.length);await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#play-state').dataset.state==='completed');
  assert.equal(await page.evaluate(()=>window.__colorCompiles.length),compileCount+1);assert.equal((await stage()).state,'idle');
  const writes=await page.evaluate(()=>window.__softwareHID.reports.filter(report=>report.bytes[0]===0x63).map(report=>report.bytes));
  assert.deepEqual(writes.map(bytes=>[bytes[6],...bytes.slice(1,4)]),aurora.pair.map((color,index)=>[index+1,...color.slice(1).match(/../g).map(byte=>parseInt(byte,16))]));
  checks.push('Explicit direct Play compiles Aurora’s independent pair (not its first two swatches) and sends exactly two ordered targets to injected in-memory HID only');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);assert.ok(requests.every(request=>request.method==='GET'));
  await writeFile(path.join(output,'color-sets.json'),JSON.stringify({status:'PASS',captured_at:new Date().toISOString(),base,hardware_access:false,daemon_access:false,real_permission_ui:false,checks,captures,compiler_results:compileResults,software_hid:await page.evaluate(()=>window.__softwareHID),errors,outside,failed},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',checks:checks.length,captures:captures.length,output}));
}
try {
  const manifestResponse=await fetch(base+mount+'site-build.json');
  assert.equal(manifestResponse.status,200,'public website provenance loads under the project subpath');
  const publicBytes=Buffer.from(await manifestResponse.arrayBuffer());
  assert.deepEqual(publicBytes,await readFile(path.join(root,'dist/web/site-build.json')));
  const publicBuild=JSON.parse(publicBytes.toString('utf8'));
  assert.equal(publicBuild.channel,'development-preview');
  assert.equal(publicBuild.extension.status,'experimental');
  assert.equal(publicBuild.core.source_commit,'b5cfe68cbb412d81a80d948b845aee5b0aba586b');
  checks.push('Public source and closed website manifest served intact under '+mount);
  await daemonDiagnostics();
  if(process.argv.includes('--color-sets')||process.argv.includes('--catalog-only'))await colorSets();else if(process.argv.includes('--cycles'))await cycleDefaults();else if(process.argv.includes('--usability'))await usability();else {
  await page.goto(base+mount, {waitUntil:'networkidle'}); await waitReady();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('html').getAttribute('data-studio-skin'),'nightlab');
  assert.equal(await page.locator('[data-light-canvas]').isVisible(),true);
  assert.equal(await page.locator('#ownership').isChecked(),false);
  assert.match(await page.locator('[data-i18n="ownership"]').textContent(),/Stop the native nb1 daemon/);
  assert.equal(await page.evaluate(()=>window.NB1_DESIGN_SIMULATION),undefined);
  assert.deepEqual(await page.evaluate(()=>window.__softwareHID.reports),[]);
  await page.locator('#connect').click();
  assert.equal(await page.locator('#connection-options').evaluate(node=>node.open),true);
  assert.deepEqual(await page.evaluate(()=>window.__softwareHID.picker),[]);
  checks.push('Nightlab before first paint, real GL, English default, real ownership gate, nested relative mount');

  for (const kind of ['set','off','fade','blink','breathe','pulse','alternate','orbit','rainbow']) {
    await page.locator(`#presets [data-kind="${kind}"]`).click(); await frame();
    assert.equal(await page.locator('.composer').getAttribute('data-active-action'),kind);
    if(kind==='fade') assert.equal(await page.locator('label[for="color-input-0"]').textContent(),'Target color');
    if(kind==='orbit'||kind==='alternate')assert.match(await page.locator('#action-description').textContent(),/A → LED 1 · B → LED 2/);
    await page.locator('#preview').click();
    await page.waitForFunction(()=>['playing','completed'].includes(document.querySelector('[data-light-stage]').dataset.screenPreviewState));
  }
  checks.push('All nine Actions compile and screen-play through the matched Go plan; contextual labels');
  await page.locator('#presets [data-kind="rainbow"]').click();
  // Keep the preview active through Pause even on slow software-rendered CI.
  await page.locator('#param-period_ms').fill('3000'); await page.locator('#param-cycles').fill('12');
  await page.locator('#preview').click();
  await page.waitForFunction(()=>+document.querySelector('[data-light-stage]').dataset.screenPreviewElapsed>100);
  const first = await stage();
  await page.waitForFunction(colors=>+document.querySelector('[data-light-stage]').dataset.screenPreviewElapsed>700&&JSON.stringify([...document.querySelectorAll('[data-studio-color]')].map(node=>node.textContent))!==JSON.stringify(colors),first.colors);
  await page.locator('[data-preview-control="pause"]').click();
  await page.waitForFunction(()=>window.__frames.at(-1)?.state==='paused'&&window.__frames.at(-1).colors.every((color,index)=>color===document.querySelectorAll('[data-studio-color]')[index].textContent));
  await frame(); const paused=await stage(); await page.waitForTimeout(160); assert.deepEqual(await stage(),paused);
  await page.locator('[data-preview-control="pause"]').click(); await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.screenPreviewState==='playing');
  await page.locator('[data-preview-control="stop"]').click(); await page.locator('[data-preview-control="replay"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.screenPreviewState==='playing');
  await page.locator('[data-preview-control="stop"]').click();
  assert.deepEqual(await page.evaluate(()=>window.__softwareHID.reports),[]);
  assert.deepEqual(await page.evaluate(()=>window.__accepted),[]);
  checks.push('Actual Rainbow changes colors, pause freezes colors/time, resume/stop/replay, no device acceptance or reports');

  await page.locator('#presets [data-kind="orbit"]').click();
  await page.locator('#color-input-0').fill('#ff0000'); await page.locator('#color-input-1').fill('#0000ff');
  await page.waitForFunction(()=>document.querySelector('[data-studio-color="one"]').textContent==='#ff0000'&&document.querySelector('[data-studio-color="two"]').textContent==='#0000ff');
  const authored = await page.locator('#request').inputValue();
  await page.locator('#studio-appearance-trigger').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.skinChoice),'nightlab'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#studio-appearance-trigger').getAttribute('aria-expanded'),'false');
  for (const skin of ['instrument','airwave','nightlab']) {
    await page.locator('#studio-appearance-trigger').click(); await page.locator(`[data-skin-choice="${skin}"]`).click();
    assert.equal(new URL(page.url()).searchParams.get('skin'),skin==='nightlab'?null:skin);
    assert.equal(await page.locator('#request').inputValue(),authored);
  }
  for (const width of [1366,390,320]) {
    await page.setViewportSize({width,height:900});
    for (const language of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#language').click();
      await frame(); assert.equal(await page.locator('#request').inputValue(),authored);
      await page.waitForFunction(()=>document.querySelector('[data-studio-color="one"]').textContent==='#ff0000'&&document.querySelector('[data-studio-color="two"]').textContent==='#0000ff');
      await page.locator('.stage-theatre').scrollIntoViewIfNeeded();
      const metrics = await page.evaluate(()=>{
        const box=selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};};
        return {stage:box('.stage-theatre'),title:box('.stage-dimension'),hint:box('.stage-view-hint'),zoom:box('.stage-zoom-tools'),overflow:document.documentElement.scrollWidth>innerWidth,fonts:document.fonts.status,threeState:document.querySelector('[data-light-stage]').dataset.threeState};
      });
      await writeFile(path.join(output,`bounds-${width}-${language}.json`),JSON.stringify(metrics,null,2));
      assert.equal(metrics.overflow,false);
      for(const name of ['title','hint','zoom'])assert.ok(metrics[name].left>=metrics.stage.left+10&&metrics[name].right<=metrics.stage.right-10,`${width} ${language} ${name} inside stage`);
      for(const name of ['title','hint'])assert.ok(metrics[name].right<=metrics.zoom.left-7,`${width} ${language} ${name} clears zoom`);
      await page.evaluate(()=>scrollTo(0,0)); await frame();await shot(`browser-${width}-${language}.png`);
      await page.locator('[data-light-stage]').scrollIntoViewIfNeeded();await page.locator('[data-view-action="reset"]').click();await frame();
      const name=`browser-model-${width}-${language}.png`;
      await page.locator('[data-light-stage]').screenshot({path:path.join(output,name)});captures.push(name);
    }
  }
  checks.push('Keyboard appearance menu and theme URL; six 1366/430/390/320 English/Chinese bounds and draft-preserving captures');
  if(await page.locator('html').getAttribute('lang')!=='en')await page.locator('#language').click();
  await page.setViewportSize({width:1366,height:900});
  await page.locator('[data-view-action="zoom-in"]').click();
  const canvas=page.locator('[data-light-canvas]'); await canvas.focus(); await page.keyboard.press('ArrowLeft');
  assert.notEqual(await page.locator('[data-light-stage]').getAttribute('data-view-yaw'),'0.00000');
  assert.equal(await page.locator('[data-view-action="rock"]').isDisabled(),true);
  await canvas.scrollIntoViewIfNeeded();let box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  const beforeWheel=await page.locator('[data-light-stage]').getAttribute('data-view-zoom');
  await page.mouse.wheel(0,150);await page.waitForTimeout(80);
  assert.equal(await page.locator('[data-light-stage]').getAttribute('data-view-zoom'),beforeWheel,'Ordinary wheel leaves zoom unchanged');
  await canvas.scrollIntoViewIfNeeded();box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.keyboard.down('Control');
  try {
    await page.mouse.wheel(0,-10000);await page.waitForFunction(()=>+document.querySelector('[data-light-stage]').dataset.viewZoom===1.8);
    await page.mouse.wheel(0,10000);await page.waitForFunction(()=>+document.querySelector('[data-light-stage]').dataset.viewZoom===.7);
  } finally {await page.keyboard.up('Control');}
  await canvas.focus();await page.keyboard.press('Home');
  await page.waitForFunction(()=>+document.querySelector('[data-light-stage]').dataset.viewZoom===1);
  const session=await context.newCDPSession(page);
  try {
    const box=await canvas.boundingBox(),x=box.x+box.width/2,y=box.y+box.height*.58;
    const points=distance=>[{x:x-distance,y,id:1},{x:x+distance,y,id:2}];
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(30)});
    for(const distance of [40,50,60,70])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(distance)});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>+document.querySelector('[data-light-stage]').dataset.viewZoom>1.03);
    assert.ok(+await page.locator('[data-light-stage]').getAttribute('data-view-zoom')<=1.8);
  } finally {await session.detach();}
  checks.push('Actual Ctrl-wheel bounds, ordinary wheel, Home reset, touch pinch and reduced motion');
  // Verify that the actual interactive canvas receives both catalog colors.
  await page.locator('[data-view-action="reset"]').click();
  const images = [];
  for (const [a,b] of [['#003dff','#000000'], ['#000000','#ff1804'], ['#003dff','#ff1804']]) {
    await page.locator('#color-input-0').fill(a);
    await page.locator('#color-input-1').fill(b);
    await page.waitForFunction(([a,b]) => document.querySelector('[data-studio-color="one"]').textContent === a
      && document.querySelector('[data-studio-color="two"]').textContent === b, [a,b]);
    await frame();
    images.push(await canvas.screenshot());
  }
  assert.ok(!images[0].equals(images[2]) && !images[1].equals(images[2]), 'Each authored LED changes the assembled canvas');
  await writeFile(path.join(output,'assembled-blue-red.png'),images[2]); captures.push('assembled-blue-red.png');
  const poses=[{name:'front-on',left:6,down:4},{name:'usb-quarter',left:4,down:1},{name:'side',right:2,down:4},{name:'upper',left:1,up:1},{name:'lower',left:1,flip:true},{name:'front-high',left:6,down:2}];
  for(const lighting of ['lit','unlit']) {
    const a=lighting==='lit'?'#00ff00':'#000000',b=lighting==='lit'?'#ff0000':'#000000';
    await page.locator('#color-input-0').fill(a);await page.locator('#color-input-1').fill(b);
    await page.waitForFunction(({a,b})=>document.querySelector('[data-studio-color="one"]').textContent===a&&document.querySelector('[data-studio-color="two"]').textContent===b,{a,b});
    for(const pose of poses) {
      await page.locator('[data-view-action="reset"]').click();await page.locator('[data-view-action="zoom-in"]').click();await canvas.focus();
      for(const [key,count] of [['ArrowLeft',pose.left||0],['ArrowRight',pose.right||0],['ArrowDown',pose.down||0],['ArrowUp',pose.up||0]])for(let index=0;index<count;index++)await page.keyboard.press(key);
      if(pose.flip)await page.locator('[data-view-action="flip"]').click();
      await frame();await canvas.evaluate(node=>node.blur());await page.mouse.move(0,0);
      const name=`joint-${pose.name}-${lighting}.png`;await page.locator('.stage-theatre').screenshot({path:path.join(output,name)});captures.push(name);
    }
  }
  checks.push('Six real camera poses lit/unlit; reduced motion and fixed physical LED labels');

  await page.locator('#presets [data-kind="set"]').click();await page.locator('#color-input-0').fill('#123456');
  await page.locator('#ownership').check();await page.locator('#connect').click();await page.waitForFunction(()=>!document.querySelector('#play').disabled);
  assert.deepEqual(await page.evaluate(()=>window.__softwareHID.picker),[{filters:[{vendorId:0x27b8,productId:0x01ed}]}]);
  assert.deepEqual(await page.evaluate(()=>window.__softwareHID.reports),[]);
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.studioSource==='accepted');
  assert.deepEqual((await stage()).colors,['#123456','#123456']);
  const count=await page.evaluate(()=>window.__softwareHID.reports.length);await page.locator('#preview').click();
  await page.waitForFunction(()=>['playing','completed'].includes(document.querySelector('[data-light-stage]').dataset.screenPreviewState));
  assert.equal(await page.evaluate(()=>window.__softwareHID.reports.length),count);
  await page.locator('#presets [data-kind="set"]').click();await page.locator('#color-input-0').fill('#abcdef');
  await page.evaluate(()=>window.__softwareHID.fail=true);await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('unknown'));
  const uncertain=await page.evaluate(()=>window.__softwareHID.reports.length);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>window.__softwareHID.reports.length),uncertain);
  assert.ok((await page.evaluate(()=>window.__accepted)).every(target=>target.color!=='#abcdef'));
  await page.locator('#disconnect').click();await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Not connected');
  checks.push('Software-only HID exercises unchanged explicit ownership, filtered chooser, actual accepted adapter, unknown write/no retry/disconnect');

  await page.goto(base+mount+'?view=faces',{waitUntil:'networkidle'});await waitReady(true);
  assert.equal(await page.evaluate(()=>window.__gl),0);assert.equal(await page.locator('[data-light-canvas]').count(),0);
  await page.locator('#presets [data-kind="fade"]').click();await page.locator('#color-input-0').fill('#000000');
  await page.locator('#param-led label').filter({has:page.locator('input[value="1"]')}).click();await frame();
  await page.waitForFunction(()=>document.querySelector('[data-led="1"]').dataset.faceState==='off'&&document.querySelector('[data-led="2"]').dataset.faceState==='unspecified');
  await shot('browser-two-faces.png');
  await page.goto(base+'/',{waitUntil:'networkidle'});await waitReady();
  await canvas.evaluate(node=>node.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.threeState==='lost');
  assert.equal(await page.locator('[data-stage-fallback]').isVisible(),true);
  await shot('browser-context-loss.png');
  checks.push('2D-only creates no GL; off/unspecified fixed faces; root mount and context-loss fallback');
  await page.goto(base+mount+'?view=faces',{waitUntil:'networkidle'});await waitReady(true);
  const metrics = await page.evaluate(async () => {
    const THREE = await import('./shared/nightlab/vendor/three/three.module.js');
    const {STLLoader} = await import('./shared/nightlab/vendor/three/STLLoader.js');
    const {createBlink1Model} = await import('./shared/nightlab/light-model.js');
    const loader = new STLLoader();
    const [diffuserGeometry, frameGeometry] = await Promise.all(['diffuser','frame'].map(part =>
      loader.loadAsync('./shared/nightlab/model-assets/blink1mk2_enclosure_' + part + '_v3k.stl')));
    const model = createBlink1Model(THREE, {diffuserGeometry, frameGeometry, variant:'assembled'});
    diffuserGeometry.dispose();
    frameGeometry.dispose();
    const renderer = new THREE.WebGLRenderer({antialias:false});
    const size = 64;
    const target = new THREE.WebGLRenderTarget(size, size, {type:THREE.FloatType});
    const ensure = (condition, message) => { if (!condition) throw Error(message); };
    try {
      // Render the production CAD diffuser with its production material, in
      // isolation from ambient light, the USB and light falling on other objects.
      const shell = model.group.getObjectByName('One continuous milky diffuser').clone(false);
      const scene = new THREE.Scene();
      scene.add(shell);
      const bounds = new THREE.Box3().setFromObject(shell);
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      const camera = new THREE.OrthographicCamera(-radius,radius,radius,-radius,.01,100);
      renderer.setSize(size,size);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0,0);
      renderer.toneMapping = THREE.NoToneMapping;
      const gl = renderer.getContext();
      ensure(gl.getExtension('EXT_color_buffer_float'),'A floating-point target is required for raw radiance');
      function sample(one, two, source) {
        model.setColors(one, two, source);
        renderer.render(scene, camera);
        const rgb = new Float32Array(size * size * 4);
        renderer.readRenderTargetPixels(target,0,0,size,size,rgb);
        ensure(gl.getError() === gl.NO_ERROR, 'Readback of actual physical shader failed');
        return rgb;
      }
      const channels = {};
      let maxAdditionError = 0, tailMix = 0;
      for (const [face, direction] of Object.entries({top:[0,1,0],bottom:[0,-1,0],tail:[1,0,0]})) {
        camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction),radius*3);
        camera.up.set(...(face === 'tail' ? [0,1,0] : [0,0,-direction[1]]));
        camera.lookAt(center);
        const off = sample(null,null,'none');
        const red = sample('#400000',null,'draft');
        const blue = sample(null,'#000040','accepted');
        const both = sample('#400000','#000040','preview');
        const cleared = sample('#400000','#000040','none');
        let r = 0, b = 0;
        for (let i=0; i<both.length; i+=4) {
          for (let c=0; c<3; c++) {
            const expected = red[i+c] + blue[i+c] - off[i+c];
            const error = Math.abs(expected - both[i+c]);
            ensure(Number.isFinite(error) && error < .0005 + .0005*Math.abs(expected), 'L1 and L2 must add in linear radiance before tone mapping');
            ensure(Math.abs(cleared[i+c] - off[i+c]) < .00001,'Clearing the preview must restore the unlit shell');
            maxAdditionError = Math.max(maxAdditionError, error);
          }
          r += red[i] - off[i];
          b += blue[i+2] - off[i+2];
          if (face === 'tail' && red[i]-off[i] > .001 && blue[i+2]-off[i+2] > .001) tailMix++;
        }
        channels[face] = {red:r, blue:b};
      }
      ensure(channels.top.red > channels.bottom.red && channels.bottom.red > 0, 'L1 illuminates the top and scatters toward the bottom');
      ensure(channels.bottom.blue > channels.top.blue && channels.top.blue > 0, 'L2 illuminates the bottom and scatters toward the top');
      ensure(tailMix > 0, 'The round tail contains pixels lit by both PCB LEDs');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {channels, maxAdditionError, tailMix, renderer:gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)};
    } finally {
      model.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss();
    }
  });
  assert.match(metrics.renderer,/SwiftShader/i);
  await writeFile(path.join(output,'light-field-gpu.json'),JSON.stringify(metrics,null,2)+'\n');
  checks.push('Assembled CAD physical shader: two-face dominance, additive radiance, tail mixing and clearing');

  await page.addInitScript(() => {
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
  });
  await page.goto(base+mount,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('[data-light-stage]').dataset.threeState==='fallback');
  assert.equal(await page.locator('[data-stage-fallback]').isVisible(),true);
  await page.waitForFunction(()=>!document.querySelector('#preview').disabled);
  await page.evaluate(()=>{document.querySelector('#preview').click();document.querySelector('#presets [data-kind="orbit"]').click();});
  await frame();await page.waitForTimeout(100);
  assert.equal((await stage()).state,'idle','A new Action cancels an in-flight screen preview');
  checks.push('No-WebGL two-face fallback and cancellation of stale compile/preview intent');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);
  assert.ok(requests.every(request=>request.method==='GET'));
  await writeFile(path.join(output,'acceptance.json'),JSON.stringify({status:'PASS',captured_at:new Date().toISOString(),base,mount,hardware_access:false,daemon_access:false,published:false,checks,captures,errors,outside,failed,requests},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',checks:checks.length,captures:captures.length,output,hardware_access:false}));
  }
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
