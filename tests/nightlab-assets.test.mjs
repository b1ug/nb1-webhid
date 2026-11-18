import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const nightlab = new URL('src/shared/nightlab/', root);
const receipt = JSON.parse(await readFile(new URL('handoff-provenance.json', nightlab), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');

test('shared color sets are immutable authoring suggestions with independent editable Sequences', async () => {
  // Exercise the delivered public authoring API without running its DOM paint loop.
  const element = () => ({dataset:{},style:{},append(){},addEventListener(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return null;},createTHead(){return element();},createTBody(){return element();},insertRow(){return element();},insertCell(){return element();}});
  const composer=element(), window={};
  const document={documentElement:{dataset:{nb1App:'browser'},lang:'en'},querySelector(selector){return selector==='.composer'?composer:null;},querySelectorAll(){return [];},getElementById(){return null;},createElement:element,addEventListener(){},dispatchEvent(){}};
  runInNewContext(await readFile(new URL('composer-ui.js',nightlab),'utf8'),{window,document,requestAnimationFrame(){},MutationObserver:class{observe(){}},CustomEvent:class{}});
  const api=window.NB1ColorSets;
  assert.ok(Object.isFrozen(api));assert.ok(Object.isFrozen(api.sets));assert.equal(api.sets.length,8);assert.equal(api.selectedId,'essentials');assert.equal(api.catalog,undefined);
  const common=api.get('essentials');assert.ok(Object.isFrozen(common));assert.ok(Object.isFrozen(common.colors));assert.ok(Object.isFrozen(common.pair));
  assert.deepEqual(Array.from(common.colors),['#ff0000','#ffa500','#ffff00','#00ff00','#00a060','#00ffff','#0000ff','#8f00ff','#ffffff']);
  assert.deepEqual(Array.from(common.pair),['#ff0000','#0000ff']);assert.ok(!api.sets.includes(common));assert.throws(()=>api.sequence('essentials'));
  assert.deepEqual(Array.from(api.sets,set=>set.id),['candlelight','tide','petals','neon','forest','dusk','citrus','aurora']);
  assert.equal(api.get('whites'),undefined);assert.throws(()=>api.sequence('whites'));
  assert.equal(new Set(api.sets.map(set=>set.id)).size,8);
  const curated=Array.from(api.sets);
  assert.equal(curated.reduce((count,set)=>count+set.colors.length,0),64);assert.equal(new Set(curated.flatMap(set=>Array.from(set.colors))).size,30);
  for(const set of api.sets){
    assert.ok(Object.isFrozen(set));assert.ok(Object.isFrozen(set.colors));assert.ok(Object.isFrozen(set.label));assert.ok(Object.isFrozen(set.character));
    assert.equal(set.colors.length,8);
    assert.equal(new Set(set.colors).size,set.colors.length);
    assert.ok(Object.isFrozen(set.pair));assert.equal(set.pair.length,2);assert.equal(new Set(set.pair).size,2);assert.ok(set.pair.every(color=>set.colors.includes(color)));
    assert.ok(set.colors.every(color=>/^#[0-9a-f]{6}$/.test(color)));assert.ok(set.label.en&&set.label['zh-CN']);
    const sequence=api.sequence(set.id),second=api.sequence(set.id);
    assert.equal(sequence.timing,'serial');assert.equal(sequence.repeat,3);assert.equal(sequence.on_finish,'off');
    assert.deepEqual(JSON.parse(JSON.stringify(sequence.steps)),Array.from(set.colors,color=>({targets:[{led:0,color}],fade_ms:600,hold_ms:400})));
    sequence.steps[0].targets[0].color='#000000';assert.equal(second.steps[0].targets[0].color,set.colors[0]);
  }
  assert.notDeepEqual(Array.from(api.get('aurora').pair),Array.from(api.get('aurora').colors.slice(0,2)));
  assert.equal(api.get('missing'),undefined);assert.throws(()=>api.sequence('missing'));
});

test('approved Nightlab tokens, viewer geometry, CAD, and licenses retain delivered bytes', async () => {
  for (const name of ['airwave-tokens.css', 'studio.css', 'studio-skins.css', 'studio-appearance.js', 'preview-timeline.js', 'light-model.js', 'enclosure-fit.js', ...Object.keys(receipt.source_files).filter(name=>/^(model-assets|vendor\/three)\//.test(name))]) {
    const bytes = await readFile(new URL(name, nightlab));
    assert.equal(digest(bytes), receipt.source_files[name].sha256, name);
  }
  for (const [name, value] of Object.entries(receipt.browser_styles)) assert.equal(digest(await readFile(new URL('src/web/'+name, root))), value.sha256, name);
  const brand = JSON.parse(await readFile(new URL('src/shared/asset-provenance.json', root), 'utf8'));
  for (const [name, value] of Object.entries(brand.files)) assert.equal(digest(await readFile(new URL(name, root))), value.sha256, name);
});

test('the production presentation has no software device runtime or route-derived app identity', async () => {
  for (const entry of await readdir(nightlab, {withFileTypes:true})) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = await readFile(new URL(entry.name, nightlab), 'utf8');
    assert.doesNotMatch(source, /NB1_DESIGN_SIMULATION|__review|design-light-01|nb1-design-report|Object\.defineProperty\(navigator/, entry.name);
    assert.doesNotMatch(source, /location\.pathname\.includes\(['"]\/browser\//, entry.name);
  }
  const html = await readFile(new URL('src/web/index.html', root), 'utf8');
  assert.match(html, /data-nb1-app="browser"/);
  assert.match(html, /id="ownership" type="checkbox"/);
  assert.match(html, /data-i18n="ownershipCheck">I have stopped other controllers for this light\./);
  assert.doesNotMatch(html, /review-runtime|design-preview-banner/);
  const manifest = JSON.parse(await readFile(new URL('dist/build.json', root), 'utf8'));
  assert.ok(manifest.files.some(file=>file.path==='web/shared/nightlab/light-model.js'));
  assert.ok(manifest.files.every(file=>!file.path.startsWith('extension/shared/nightlab/')), 'Extension visuals retain their independent scope');
});

test('public packages omit private workspace data and internal review materials', async () => {
  const manifest = JSON.parse(await readFile(new URL('dist/build.json', root), 'utf8'));
  assert.ok(manifest.files.every(file => !/(?:^|\/)(?:screenshots|hardware-checks)\/|project-led-faces\.txt|docs\/INTEGRATION\.md/.test(file.path)));
  for (const file of manifest.files.filter(file => /\.(?:json|html|md|txt)$/.test(file.path))) {
    const text = await readFile(new URL('dist/' + file.path, root), 'utf8');
    assert.doesNotMatch(text, /\/Users\/|Notion-Doc1|reference\/extracted|"serial"\s*:\s*"[0-9a-f]{8}"/i, file.path);
  }
  assert.ok(manifest.files.some(file => file.path === 'web/shared/compiler/COLORKIT-LICENSE.txt'));
  assert.ok(manifest.files.some(file => file.path === 'extension/shared/compiler/COLORKIT-LICENSE.txt'));
});
