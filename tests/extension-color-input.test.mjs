import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
import {colorInputJSON} from '../src/extension/ui.js';
import {createController} from '../src/shared/extension-controller.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const cache=path.join(root,'.cache/compiler');
globalThis.crypto ||= webcrypto;
await import(pathToFileURL(path.join(cache,'wasm_exec.js')).href);
const go=new globalThis.Go();
const {instance}=await WebAssembly.instantiate(await fs.readFile(path.join(cache,'nb1.wasm')),go.importObject);
await new Promise((resolve,reject)=>{
  globalThis.nb1GoOnReady=resolve;
  void go.run(instance).catch(reject);
});
delete globalThis.nb1GoOnReady;
const invoke=(method,raw)=>{
  const response=JSON.parse(globalThis.nb1Go[method](raw));
  if(!response.ok)throw Object.assign(new Error(response.error.message),{code:response.error.code});
  return response.result;
};

function fixture(){
  const writes=[],resolved=[],compiled=[],alarms=new Map();
  const transport={connected:true,uncertain:false,deviceInfo:{productName:'software fixture'},async stopNativePlayback(){writes.push('stop');},async fadeTo(target){writes.push(target);}};
  const chrome={storage:{local:{async get(){return {};},async set(){}}},alarms:{async create(name,alarm){alarms.set(name,alarm);},async clear(name){return alarms.delete(name);}}};
  const controller=createController({chrome,transport,session:'color-input',now:()=>1_000_000,
    resolveColor:async raw=>{resolved.push(raw);return invoke('resolveColor',raw);},
    compile:async action=>{compiled.push(action);return invoke('compileAction',JSON.stringify(action));},
  });
  return {controller,writes,resolved,compiled,alarms};
}

test('the extension wraps plain names and hex, while authored JSON remains text',()=>{
  assert.equal(colorInputJSON(' red '),'"red"');
  assert.equal(colorInputJSON('#abc'),'"#abc"');
  for(const raw of ['{"space":"rgb8","r":1,"r":2,"g":0,"b":0}','"\\ud800"','{"space":"hsv","h_deg":1.250000,"s_pct":50,"v_pct":25}'])assert.equal(colorInputJSON(' '+raw+' '),raw);
});

test('actual Go rejects duplicate fields, strict numeric tokens and escaped unpaired Unicode before any command',async()=>{
  for(const value of ['{"space":"rgb8","r":1,"r":2,"g":0,"b":0}','{"space":"rgb8","r":1.0,"g":0,"b":0}','{"space":"hsv","h_deg":1e1,"s_pct":100,"v_pct":50}','"\\ud800"']){
    const f=fixture(),raw=colorInputJSON(value);
    await assert.rejects(f.controller.dispatch({op:'set',colorJSON:raw}),{code:'invalid_input'});
    await assert.rejects(f.controller.dispatch({op:'timer',minutes:1,colorJSON:raw}),{code:'invalid_input'});
    assert.deepEqual(f.resolved,[raw,raw]);
    assert.deepEqual(f.compiled,[]);assert.deepEqual(f.writes,[]);assert.equal(f.alarms.size,0);
  }
});

test('actual Go resolves name, short hex, rgb8 and hsv inputs before the Set compiler',async()=>{
  const cases=[['red','#ff0000'],['#abc','#aabbcc'],['{"space":"rgb8","r":4,"g":8,"b":12}','#04080c'],['{"space":"hsv","h_deg":120,"s_pct":100,"v_pct":50}','#008000']];
  for(const [value,expected] of cases){
    const f=fixture(),raw=colorInputJSON(value);
    const state=await f.controller.dispatch({op:'set',colorJSON:raw});
    assert.deepEqual(f.resolved,[raw]);
    assert.deepEqual(f.compiled,[{kind:'set',color:expected,led:0}]);
    assert.equal(state.lastEvent.status,'command_sent');
    assert.equal(f.writes.length,2);assert.equal(f.writes[1].color,expected);
  }
});
