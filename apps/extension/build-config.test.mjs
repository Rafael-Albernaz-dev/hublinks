import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { configureManifest, deploymentOrigin } from './build-config.mjs';

test('deployment requires a single exact HTTPS origin', () => {
  assert.equal(deploymentOrigin(undefined), '');
  assert.equal(deploymentOrigin('https://hub.example.test'), 'https://hub.example.test');
  for (const value of [
    'http://hub.example.test',
    'https://hub.example.test/',
    'https://hub.example.test/path',
    'https://user:password@hub.example.test',
    'https://*.example.test',
    'https://hub.example.test#fragment',
  ]) {
    assert.throws(() => deploymentOrigin(value));
  }
});

test('compiled production bridge recognizes only its official origin', async () => {
  const origin = 'https://hub.example.test';
  const result = await build({
    entryPoints: [new URL('./src/workspace.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    define: { __HUB_EXTENSION_ORIGIN__: JSON.stringify(origin) },
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, URL });
  const bridge = module.exports;
  assert.equal(bridge.WORKSPACE_URL, origin);
  assert.equal(bridge.isWorkspace(`${origin}/dashboard`), true);
  for (const url of [
    'http://127.0.0.1:5177',
    'http://localhost:5177',
    'https://hub.example.test.evil.test',
    'https://other.example.test',
    'http://hub.example.test',
    undefined,
  ]) {
    assert.equal(bridge.isWorkspace(url), false);
  }
});

test('deployed manifest binds only the official origin and preserves identity and filling permissions', async () => {
  const original = JSON.parse(
    await readFile(new URL('./static/manifest.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(configureManifest(original, ''), original);
  const result = configureManifest(original, 'https://hub.example.test');
  assert.deepEqual(result.externally_connectable.matches, ['https://hub.example.test/*']);
  assert.deepEqual(result.content_scripts[0].matches, ['https://hub.example.test/*']);
  assert.deepEqual(result.host_permissions, ['https://*/*']);
  assert.deepEqual(result.permissions, original.permissions);
  assert.equal(result.key, original.key);
  assert.equal(original.externally_connectable.matches.length, 2);
});
