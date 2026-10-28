import dns from 'node:dns';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  denied.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  denied.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !denied.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

// Validate the addresses used by this exact socket, not a separate preflight DNS lookup.
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '');
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
      return callback(new Error('Non-public destination'), '');
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

/** Optional icon lookup: no redirects, no private sockets, bounded time and streaming size. */
export function readPublicImage(url: URL): Promise<{ bytes: Buffer; mime: string } | null> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (isIP(hostname) && !isPublicAddress(hostname))
  )
    return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { bytes: Buffer; mime: string } | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const request = https.get(
      url,
      {
        agent: false,
        lookup: publicLookup,
        signal: AbortSignal.timeout(3500),
        headers: {
          Accept: 'image/png,image/jpeg,image/webp',
          'User-Agent': 'HublinkFaviconBot/1.0',
        },
      },
      (response) => {
        // Reject before reading or following Location, including public-to-private redirects.
        if (
          response.statusCode !== 200 ||
          Number(response.headers['content-length'] ?? 0) > 200_000
        ) {
          response.destroy();
          finish(null);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 200_000) {
            response.destroy();
            finish(null);
          } else chunks.push(chunk);
        });
        response.on('error', () => finish(null));
        response.on('end', () =>
          finish(
            size
              ? {
                  bytes: Buffer.concat(chunks),
                  mime: (response.headers['content-type'] ?? '')
                    .split(';')[0]!
                    .trim()
                    .toLowerCase(),
                }
              : null,
          ),
        );
      },
    );
    request.on('error', () => finish(null));
  });
}
