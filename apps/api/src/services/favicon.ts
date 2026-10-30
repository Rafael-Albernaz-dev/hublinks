import { icoToPng, isIco, isPng } from './icon.js';
import { readPublicResource } from './publicHttps.js';

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

  const deadline = Date.now() + 12_000;
  const imageAccept = 'image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon';
  const tried = new Set<string>();

  async function tryFetchIcon(target: URL): Promise<string | null> {
    if (tried.has(target.href) || Date.now() > deadline) return null;
    tried.add(target.href);
    try {
      const result = await readPublicResource(target, {
        accept: imageAccept,
        // Multi-resolution ICO files are often several hundred KB before conversion.
        maxBytes: 1_000_000,
        redirects: 3,
      });
      if (!result) return null;
      const image = normalizeIcon(result.bytes);
      // Stored card logos are capped at 500 KB.
      if (!image || image.bytes.byteLength > 500_000) return null;
      return `data:${image.mime};base64,${image.bytes.toString('base64')}`;
    } catch {
      return null;
    }
  }

  // Declared icons come first: many sites keep theirs outside the conventional root paths.
  const page = await readPublicResource(new URL('/', parsed.origin), {
    accept: 'text/html',
    maxBytes: 256_000,
    redirects: 3,
    truncate: true,
  }).catch(() => null);
  const declared = page ? declaredIcons(page.bytes.toString('utf8'), page.url) : [];
  const candidates = [
    ...declared,
    new URL('/apple-touch-icon.png', parsed.origin),
    new URL('/favicon.ico', parsed.origin),
    new URL('/favicon.png', parsed.origin),
  ];
  for (const candidate of candidates) {
    const logoDataUrl = await tryFetchIcon(candidate);
    if (logoDataUrl) return { ok: true, logoDataUrl, host };
  }
  return { ok: true, logoDataUrl: null, host };
}

/** Sniffs the bytes (never trusting Content-Type alone) and converts ICO to PNG. */
export function normalizeIcon(bytes: Buffer): { bytes: Buffer; mime: string } | null {
  if (isPng(bytes)) return { bytes, mime: 'image/png' };
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { bytes, mime: 'image/jpeg' };
  if (
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return { bytes, mime: 'image/webp' };
  if (isIco(bytes)) {
    const png = icoToPng(bytes);
    return png && { bytes: png, mime: 'image/png' };
  }
  // HTML error pages served with an image Content-Type must not become logos.
  return null;
}

const ICON_RELS = ['apple-touch-icon', 'apple-touch-icon-precomposed', 'icon', 'shortcut icon'];

/** Extracts up to four HTTPS icon URLs from <link rel="...icon..."> tags, best first. */
export function declaredIcons(html: string, base: URL): URL[] {
  const head = html.slice(0, 256_000);
  const found: Array<{ url: URL; rank: number }> = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
        .exec(tag)
        ?.slice(1)
        .find((value) => value !== undefined)
        ?.trim();
    const rel = attr('rel')?.toLowerCase().replace(/\s+/g, ' ');
    const href = attr('href');
    if (!rel || !href || !ICON_RELS.includes(rel)) continue;
    const type = attr('type')?.toLowerCase() ?? '';
    if (type.includes('svg') || /\.svg(?:[?#]|$)/i.test(href) || href.startsWith('data:')) continue;
    let url: URL;
    try {
      url = new URL(href.replace(/&amp;/g, '&'), base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') continue;
    const size = Number(/(\d+)x\d+/i.exec(attr('sizes') ?? '')?.[1] ?? 0);
    found.push({
      url,
      rank: (rel.startsWith('apple-touch-icon') ? 1000 : 0) + Math.min(size, 256),
    });
  }
  return found
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4)
    .map((item) => item.url);
}
