import type { FastifyReply } from 'fastify';
import type { ApiContext, RateLimitConfig, ServerOptions } from '../types/index.js';

export function applySecurityHeaders(reply: FastifyReply): void {
  reply.headers({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
}

export function createRateLimiter(options: ServerOptions = {}): ApiContext['rateLimit'] {
  const limits: Record<'login' | 'tickets', RateLimitConfig> = {
    login: { max: 20, windowMs: 60_000, ...options.loginRateLimit },
    tickets: { max: 30, windowMs: 60_000, ...options.ticketRateLimit },
  };
  for (const limit of Object.values(limits)) {
    if (
      !Number.isSafeInteger(limit.max) ||
      limit.max < 1 ||
      !Number.isSafeInteger(limit.windowMs) ||
      limit.windowMs < 1
    )
      throw new Error('Rate limits must use positive safe integers.');
  }
  const entries = new Map<string, { timestamps: number[]; windowMs: number }>();
  // Prune on each attempt, including inactive IPs; no timer outlives the server.
  return (bucket, request, reply) => {
    const now = performance.now();
    for (const [key, entry] of entries) {
      entry.timestamps = entry.timestamps.filter((time) => time > now - entry.windowMs);
      if (!entry.timestamps.length) entries.delete(key);
    }
    const limit = limits[bucket];
    const key = `${bucket}:${request.ip}`;
    const entry = entries.get(key) ?? { timestamps: [], windowMs: limit.windowMs };
    if (entry.timestamps.length >= limit.max) {
      const retryAfter = Math.max(
        1,
        Math.ceil(((entry.timestamps[0] ?? now) + limit.windowMs - now) / 1000),
      );
      reply
        .header('Retry-After', retryAfter)
        .code(429)
        .send({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
      return false;
    }
    entry.timestamps.push(now);
    entries.set(key, entry);
    return true;
  };
}
