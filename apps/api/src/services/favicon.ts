import { readPublicImage } from './publicHttps.js';

export async function discoverServiceFavicon(
  rawUrl: unknown,
): Promise<
  | { ok: true; logoDataUrl: string | null; host: string }
  | { ok: false; statusCode: 400; error: string }
> {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, statusCode: 400, error: 'URL inválida.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, statusCode: 400, error: 'URL inválida.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    !host ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.includes(':') ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
  ) {
    return { ok: false, statusCode: 400, error: 'URL de destino precisa ser HTTPS público.' };
  }
  if (host.endsWith('.test') || host === 'example.com') {
    return { ok: true, logoDataUrl: null, host };
  }

  function detectSupportedMime(buf: Buffer, headerMime: string): string | null {
    if (
      buf.byteLength >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return 'image/png';
    }
    if (buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      buf.byteLength >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (headerMime === 'image/png' || headerMime === 'image/jpeg' || headerMime === 'image/webp') {
      return headerMime;
    }
    return null;
  }

  async function tryFetchIcon(targetHref: string): Promise<string | null> {
    try {
      const result = await readPublicImage(new URL(targetHref));
      if (!result) return null;
      const buf = result.bytes;
      const mime = detectSupportedMime(buf, result.mime);
      if (!mime) return null;
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }

  const candidates = [
    { href: new URL('/apple-touch-icon.png', parsed.origin).href },
    { href: new URL('/favicon.png', parsed.origin).href },
    { href: new URL('/favicon.ico', parsed.origin).href },
  ];

  for (const candidate of candidates) {
    const logoDataUrl = await tryFetchIcon(candidate.href);
    if (logoDataUrl) {
      return { ok: true, logoDataUrl, host };
    }
  }
  return { ok: true, logoDataUrl: null, host };
}
