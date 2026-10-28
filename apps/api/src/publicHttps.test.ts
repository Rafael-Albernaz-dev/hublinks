import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import dns from 'node:dns';
import https from 'node:https';
import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { isPublicAddress, readPublicImage } from './services/publicHttps.js';

test('icon requests reject non-public IPv4, IPv6, mapped, multicast and reserved destinations', async () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::1',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(isPublicAddress(address), true, address);
  for (const url of [
    'https://2130706433/private',
    'https://[::ffff:127.0.0.1]/private',
    'http://8.8.8.8/',
  ])
    assert.equal(await readPublicImage(new URL(url)), null);
});

test('DNS resolving to internal or mixed public/private addresses never opens a local socket', async () => {
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const lookup = mock.method(
    dns,
    'lookup',
    (_host: unknown, _options: unknown, callback: (error: null, addresses: object[]) => void) => {
      callback(null, [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);
    },
  );
  try {
    assert.equal(
      await readPublicImage(new URL(`https://controlled.example.test:${address.port}/favicon.png`)),
      null,
    );
    assert.equal(lookup.mock.callCount(), 1);
    assert.equal(connections, 0);
  } finally {
    lookup.mock.restore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a redirect response is discarded without a second request or reading its body', async () => {
  const response = Object.assign(new PassThrough(), {
    statusCode: 302,
    headers: { location: 'https://127.0.0.1/private' },
  });
  const get = mock.method(
    https,
    'get',
    (_url: unknown, _options: unknown, receive: (response: unknown) => void) => {
      queueMicrotask(() => receive(response));
      return new EventEmitter();
    },
  );
  try {
    assert.equal(await readPublicImage(new URL('https://public.example.test/favicon.png')), null);
    assert.equal(get.mock.callCount(), 1);
    assert.equal(response.destroyed, true);
  } finally {
    get.mock.restore();
  }
});

test('icon streaming stops as soon as its byte limit is exceeded', async () => {
  const response = Object.assign(new PassThrough(), {
    statusCode: 200,
    headers: { 'content-type': 'image/png' },
  });
  const get = mock.method(
    https,
    'get',
    (_url: unknown, _options: unknown, receive: (response: unknown) => void) => {
      queueMicrotask(() => {
        receive(response);
        response.write(Buffer.alloc(200_001));
      });
      return new EventEmitter();
    },
  );
  try {
    assert.equal(await readPublicImage(new URL('https://public.example.test/favicon.png')), null);
    assert.equal(response.destroyed, true);
  } finally {
    get.mock.restore();
  }
});
