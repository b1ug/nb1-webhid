import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the bundled browser loader is lazy, coalesces startup and preserves strict Go errors', async () => {
  const temporary = await fs.mkdtemp(path.join(root, '.cache/loader-check-'));
  const originalFetch = globalThis.fetch;
  try {
    await fs.mkdir(path.join(temporary, 'compiler'));
    await fs.copyFile(path.join(root, 'src/shared/compiler-loader.js'), path.join(temporary, 'loader.mjs'));
    await fs.copyFile(path.join(root, '.cache/compiler/wasm_exec.js'), path.join(temporary, 'compiler/wasm_exec.js'));
    const wasm = await fs.readFile(path.join(root, '.cache/compiler/nb1.wasm'));
    let fetches = 0;
    globalThis.fetch = async url => {
      assert.equal(String(url), pathToFileURL(path.join(temporary, 'compiler/nb1.wasm')).href);
      fetches++;
      return new Response(wasm, {status: 200, headers: {'Content-Type': 'application/wasm'}});
    };
    const loader = await import(pathToFileURL(path.join(temporary, 'loader.mjs')).href);
    assert.equal(fetches, 0, 'module import does not instantiate/fetch WASM');
    const [first, second] = await Promise.all([loader.loadCompiler(), loader.loadCompiler()]);
    assert.equal(first, second);
    assert.equal(fetches, 1);
    const preview = await loader.callCompiler('compileRequest', '{"action":{"kind":"set","color":"#abc"}}');
    assert.equal(preview.sequence.steps[0].targets[0].color, '#aabbcc');
    const color = await loader.callCompiler('resolveColor', '"@mint"', {mint: '#80c0a0'});
    assert.equal(color.canonical_color, '#80c0a0');
    await assert.rejects(loader.callCompiler('compileRequest', '{"action":{"kind":"off"},"action":{"kind":"off"}}'),
      error => error instanceof loader.CompilerError && error.code === 'invalid_input' && /duplicate/.test(error.message));
    await assert.rejects(loader.callCompiler('compileAction', {kind: 'off'}), {code: 'invalid_argument'});
    await assert.rejects(loader.callCompiler('not-a-method', '{}'), {code: 'invalid_argument'});
    await assert.rejects(loader.callCompiler('resolveColor', '"red"', []), {code: 'invalid_argument'});
    assert.equal(fetches, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(temporary, {recursive: true, force: true});
  }
});
