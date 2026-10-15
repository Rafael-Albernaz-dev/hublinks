import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.js';

const directory = await mkdtemp(join(tmpdir(), 'hublink-api-test-'));
const path = join(directory, 'data', 'config.json');
const server = createServer(path);
after(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

test('/health reports readiness', async () => {
  const response = await server.inject('/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});

test('GET creates the initial configuration and reads it again', async () => {
  const first = await server.inject('/api/config');
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().version, 1);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), first.json());
  const second = await server.inject('/api/config');
  assert.deepEqual(second.json(), first.json());
});

test('PUT persists a valid configuration and GET returns it', async () => {
  const config = {
    version: 1,
    companyName: 'Example Company',
    subtitle: 'Public links',
    color: { r: 1, g: 2, b: 3 },
    logoDataUrl: null,
    links: [
      {
        id: 'one',
        title: 'Site',
        description: '',
        url: 'https://example.com/',
        logoDataUrl: 'data:image/png;base64,iVBORw==',
      },
    ],
  };
  const response = await server.inject({ method: 'PUT', url: '/api/config', payload: config });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), response.json().config);
  assert.deepEqual((await server.inject('/api/config')).json(), response.json().config);
});

test('PUT rejects invalid payloads without replacing the file', async () => {
  const before = await readFile(path, 'utf8');
  for (const payload of [{ version: 2 }, { version: 1, links: [] }]) {
    const response = await server.inject({ method: 'PUT', url: '/api/config', payload });
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.json().error, 'string');
  }
  const valid = JSON.parse(before);
  for (const invalid of [
    { ...valid, color: { r: 256, g: 2, b: 3 } },
    { ...valid, links: [{ ...valid.links[0], logoDataUrl: 'data:image/png;base64,broken!' }] },
    {
      ...valid,
      links: [
        { ...valid.links[0], logoDataUrl: `data:image/png;base64,${'AAAA'.repeat(166_667)}` },
      ],
    },
  ]) {
    const response = await server.inject({ method: 'PUT', url: '/api/config', payload: invalid });
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.json().error, 'string');
  }
  const malformedJson = await server.inject({
    method: 'PUT',
    url: '/api/config',
    headers: { 'content-type': 'application/json' },
    payload: '{',
  });
  assert.equal(malformedJson.statusCode, 400);
  assert.equal(typeof malformedJson.json().error, 'string');
  assert.equal(await readFile(path, 'utf8'), before);
});
