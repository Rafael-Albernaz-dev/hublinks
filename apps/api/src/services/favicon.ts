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
  function isUnsafeTarget(u: URL): boolean {
    const h = u.hostname.toLowerCase();
    return (
      u.protocol !== 'https:' ||
      !h ||
      u.username !== '' ||
      u.password !== '' ||
      h === 'localhost' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      h.endsWith('.test') ||
      h.includes(':') ||
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)
    );
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

  async function tryFetchIcon(targetHref: string, allowRedirect: boolean): Promise<string | null> {
    try {
      const res = await fetch(targetHref, {
        method: 'GET',
        redirect: allowRedirect ? 'follow' : 'manual',
        signal: AbortSignal.timeout(3500),
        headers: {
          Accept: 'image/png,image/jpeg,image/webp,image/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; HublinkFaviconBot/1.0)',
        },
      });
      if (!res.ok) return null;
      if (res.url) {
        try {
          const finalUrl = new URL(res.url);
          if (isUnsafeTarget(finalUrl)) return null;
        } catch {
          return null;
        }
      }
      const contentType =
        (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > 200_000) return null;
      const mime = detectSupportedMime(buf, contentType);
      if (!mime) return null;
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }

  const candidates: Array<{ href: string; allowRedirect: boolean }> = [
    {
      href: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
      allowRedirect: true,
    },
    { href: new URL('/apple-touch-icon.png', parsed.origin).href, allowRedirect: true },
    { href: new URL('/favicon.png', parsed.origin).href, allowRedirect: true },
    { href: new URL('/favicon.ico', parsed.origin).href, allowRedirect: true },
  ];

  for (const candidate of candidates) {
    const logoDataUrl = await tryFetchIcon(candidate.href, candidate.allowRedirect);
    if (logoDataUrl) {
      return { ok: true, logoDataUrl, host };
    }
  }
  return { ok: true, logoDataUrl: null, host };
}
