import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('MV3 first milestone has no native, external site or unrelated permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/extension/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3); assert.equal(manifest.minimum_chrome_version, '117');
  assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
  for (const key of ['host_permissions', 'optional_host_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) assert.equal(key in manifest, false);
  assert.equal(manifest.background.type, 'module'); assert.equal(manifest.options_ui.open_in_tab, true);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /https?:|unsafe-inline|\*/);
});
