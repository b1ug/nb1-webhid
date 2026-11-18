import { readFile } from 'node:fs/promises';
await import('../../.cache/compiler/wasm_exec.js');
const go = new globalThis.Go();
const ready = new Promise(resolve => { globalThis.nb1GoOnReady = resolve; });
const bytes = await readFile(new URL('../../.cache/compiler/nb1.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
void go.run(instance);
await ready;
delete globalThis.nb1GoOnReady;
export function compile(method, input, aliases = {}) {
  const answer = JSON.parse(globalThis.nb1Go[method](JSON.stringify(input), JSON.stringify(aliases)));
  if (!answer.ok) throw Error(answer.error?.message || 'Compiler input rejected');
  return answer.result;
}
