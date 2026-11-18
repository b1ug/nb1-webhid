import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the same pinned Go compiler behaves identically as native code and actual WASM', () => {
  assert.ok(fs.existsSync(path.join(root, '.cache/compiler/nb1.wasm')), 'Run the compiler build before tests.');
  const check = spawnSync(process.execPath, [path.join(root, 'scripts/verify-compiler.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(check.status, 0, check.stderr || check.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/compiler/node-parity.json'), 'utf8'));
  assert.equal(receipt.native_wasm_equal, true);
  assert.equal(receipt.actual_wasm_instantiated, true);
  assert.equal(receipt.hardware_access, false);
  assert.ok(receipt.vector_count >= 47);
  assert.equal(receipt.extra_checks.canonical_request_round_trip, true);
});

test('the compiler output records exact source, bridge and matching runtime identities', () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, '.cache/compiler/compiler-source.json'), 'utf8'));
  assert.equal(receipt.source_commit, 'b5cfe68cbb412d81a80d948b845aee5b0aba586b');
  assert.equal(receipt.native_backend_imported, false);
  assert.equal(receipt.go_runtime_matches_compiler, true);
  assert.equal(receipt.hardware_access, false);
  assert.ok(receipt.locked_files.length >= 21);
  assert.deepEqual(Object.keys(receipt.files).sort(), ['COLORKIT-LICENSE.txt', 'GO-LICENSE.txt', 'NB1-LICENSE.txt', 'nb1.wasm', 'wasm_exec.js']);
});
