import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { inflateSync } from 'node:zlib';
import { declaredIcons, discoverServiceFavicon, normalizeIcon } from './services/favicon.js';
import { encodeRgbaPng, icoToPng } from './services/icon.js';
import { readPublicResource } from './services/publicHttps.js';

/** Builds an ICO with one classic BMP entry; pixels are top-down [r,g,b,a]. */
function bmpIco(width: number, bpp: 4 | 32, pixels: number[][], mask: number[] = []): Buffer {
  const height = pixels.length / width;
  const palette = bpp === 4 ? [[0, 0, 0], ...pixels.map((p) => p.slice(0, 3))] : [];
  const xorStride = Math.ceil((width * bpp) / 32) * 4;
  const andStride = Math.ceil(width / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(bpp, 14);
  header.writeUInt32LE(bpp === 4 ? 16 : 0, 32);
  const paletteBytes = Buffer.alloc(bpp === 4 ? 64 : 0);
  palette.forEach(([r, g, b], i) => paletteBytes.set([b!, g!, r!, 0], i * 4));
  const xor = Buffer.alloc(xorStride * height);
  const and = Buffer.alloc(andStride * height);
  for (let y = 0; y < height; y++) {
    const row = (height - 1 - y) * xorStride;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const [r, g, b, a] = pixels[index]!;
      if (bpp === 32) xor.set([b!, g!, r!, a!], row + x * 4);
      else xor[row + (x >> 1)]! |= (index + 1) << (x % 2 ? 0 : 4);
      if (mask[index]) and[(height - 1 - y) * andStride + (x >> 3)]! |= 0x80 >> (x % 8);
    }
  }
  const entry = Buffer.concat([header, paletteBytes, xor, and]);
  const dir = Buffer.alloc(22);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);
  dir[6] = width;
  dir[7] = height;
  dir.writeUInt16LE(bpp, 12);
  dir.writeUInt32LE(entry.length, 14);
  dir.writeUInt32LE(22, 18);
  return Buffer.concat([dir, entry]);
}

/** Decodes the RGBA PNG produced by encodeRgbaPng (filter 0 rows only). */
function pngPixels(png: Buffer): { width: number; height: number; rgba: number[][] } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const raw = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
  const rgba: number[][] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * (width * 4 + 1) + 1 + x * 4;
      rgba.push([...raw.subarray(at, at + 4)]);
    }
  return { width, height, rgba };
}

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 128];
const WHITE = [255, 255, 255, 255];

test('32 bpp BMP icons (the common /favicon.ico format) convert to PNG with their alpha', () => {
  const png = icoToPng(bmpIco(2, 32, [RED, GREEN, BLUE, WHITE]));
  assert.ok(png);
  assert.deepEqual(pngPixels(png), { width: 2, height: 2, rgba: [RED, GREEN, BLUE, WHITE] });
  // normalizeIcon is what discovery uses; ICO bytes become an accepted PNG logo.
  assert.equal(normalizeIcon(bmpIco(2, 32, [RED, GREEN, BLUE, WHITE]))?.mime, 'image/png');
});

test('paletted BMP icons use the AND mask for transparency', () => {
  const png = icoToPng(bmpIco(2, 4, [RED, GREEN, RED, WHITE], [0, 1, 0, 0]));
  assert.ok(png);
  const { rgba } = pngPixels(png);
  assert.deepEqual(rgba[0], RED);
  assert.equal(rgba[1]![3], 0);
  assert.deepEqual(rgba[3], WHITE);
});

test('ICO entries already stored as PNG are returned unchanged; malformed data is rejected', () => {
  const inner = encodeRgbaPng(1, 1, Buffer.from(RED));
  const dir = Buffer.alloc(22);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);
  dir[6] = 1;
  dir[7] = 1;
  dir.writeUInt32LE(inner.length, 14);
  dir.writeUInt32LE(22, 18);
  assert.deepEqual(icoToPng(Buffer.concat([dir, inner])), inner);
  assert.equal(icoToPng(Buffer.concat([dir, Buffer.from('<html>')])), null);
  assert.equal(normalizeIcon(Buffer.from('<!doctype html>')), null);
});

test('declared icons are parsed from HTML, resolved, ranked and filtered to HTTPS raster images', () => {
  const html = `<head>
    <link rel="stylesheet" href="/app.css">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <link rel='shortcut icon' href='/static/site.ico'>
    <link href="/touch.png" rel="apple-touch-icon" sizes="180x180">
    <link rel="icon" href="http://insecure.example.test/i.png">
    <link rel=icon sizes=32x32 href="https://cdn.example.test/i.png?w=32&amp;h=32">
  </head>`;
  assert.deepEqual(
    declaredIcons(html, new URL('https://portal.example.test/pt-br')).map((url) => url.href),
    [
      'https://portal.example.test/touch.png',
      'https://cdn.example.test/i.png?w=32&h=32',
      'https://portal.example.test/static/site.ico',
    ],
  );
});

type Reply = { status: number; headers?: Record<string, string>; body?: Buffer | string };
function mockHttps(routes: Record<string, Reply>) {
  const requested: string[] = [];
  const get = mock.method(
    https,
    'get',
    (url: URL, _options: unknown, receive: (response: unknown) => void) => {
      requested.push(url.href);
      const reply = routes[url.href] ?? { status: 404 };
      const response = Object.assign(new PassThrough(), {
        statusCode: reply.status,
        headers: reply.headers ?? {},
      });
      queueMicrotask(() => {
        receive(response);
        response.end(reply.body ?? '');
      });
      return new EventEmitter();
    },
  );
  return { requested, restore: () => get.mock.restore() };
}

test('redirects are followed only through the guarded reader and never to private or HTTP targets', async () => {
  const https302 = (location: string): Reply => ({ status: 302, headers: { location } });
  const net = mockHttps({
    'https://a.example.org/': https302('/pt-br'),
    'https://a.example.org/pt-br': { status: 200, body: 'ok' },
    'https://b.example.org/': https302('https://127.0.0.1/admin'),
    'https://c.example.org/': https302('http://c.example.org/'),
    'https://d.example.org/': https302('https://d.example.org/1'),
    'https://d.example.org/1': https302('https://d.example.org/2'),
    'https://d.example.org/2': https302('https://d.example.org/3'),
    'https://d.example.org/3': https302('https://d.example.org/4'),
  });
  try {
    const options = { accept: 'text/html', maxBytes: 1000, redirects: 3 };
    const ok = await readPublicResource(new URL('https://a.example.org/'), options);
    assert.equal(ok?.url.href, 'https://a.example.org/pt-br');
    assert.equal(await readPublicResource(new URL('https://b.example.org/'), options), null);
    assert.equal(await readPublicResource(new URL('https://c.example.org/'), options), null);
    assert.equal(await readPublicResource(new URL('https://d.example.org/'), options), null);
    assert.ok(
      !net.requested.some((href) => href.includes('127.0.0.1') || href.startsWith('http:')),
    );
    assert.ok(!net.requested.includes('https://d.example.org/4'));
  } finally {
    net.restore();
  }
});

test('discovery finds an icon declared in redirected HTML and converts a /favicon.ico fallback', async () => {
  const ico = bmpIco(2, 32, [RED, GREEN, BLUE, WHITE]);
  const declared = mockHttps({
    'https://portal.example.org/': { status: 301, headers: { location: '/home' } },
    'https://portal.example.org/home': {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<link rel="icon" href="/assets/brand.ico">',
    },
    'https://portal.example.org/assets/brand.ico': {
      status: 200,
      headers: { 'content-type': 'image/x-icon' },
      body: ico,
    },
  });
  try {
    const result = await discoverServiceFavicon('https://portal.example.org');
    assert.ok(result.ok);
    assert.match(result.logoDataUrl ?? '', /^data:image\/png;base64,/);
  } finally {
    declared.restore();
  }
  // Without declared icons, the conventional ICO (previously discarded) is used.
  const fallback = mockHttps({
    'https://legacy.example.org/': { status: 200, body: '<title>Legacy</title>' },
    'https://legacy.example.org/apple-touch-icon.png': { status: 200, body: '<html>404</html>' },
    'https://legacy.example.org/favicon.ico': { status: 200, body: ico },
  });
  try {
    const result = await discoverServiceFavicon('https://legacy.example.org');
    assert.ok(result.ok);
    const png = Buffer.from(result.logoDataUrl!.split(',')[1]!, 'base64');
    assert.deepEqual(pngPixels(png).rgba, [RED, GREEN, BLUE, WHITE]);
  } finally {
    fallback.restore();
  }
});
