import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, initializeDatabase } from './db.js';
import type { ApiContext, ServerOptions } from './types/index.js';
import { applySecurityHeaders, createRateLimiter } from './services/security.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerVaultRoutes } from './routes/vault.js';
import { registerPreferencesRoutes } from './routes/preferences.js';
import { registerExtensionRoutes } from './routes/extension.js';
import { registerConfigRoutes } from './routes/config.js';
export type { ServerOptions } from './types/index.js';

const defaultPath =
  process.env.HUB_CONFIG_PATH ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/config.json');

export function createServer(
  configPath = defaultPath,
  pool = createPool(),
  options: ServerOptions = {},
) {
  const origins = (
    process.env.HUB_CLIENT_ORIGINS ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5177,http://127.0.0.1:5177')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin)
      throw new Error('HUB_CLIENT_ORIGINS must contain exact HTTP(S) origins');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    (!origins.length || !process.env.INITIAL_ADMIN_PASSWORD || !process.env.INITIAL_ADMIN_EMAIL)
  )
    throw new Error(
      'Production requires client origins and explicit initial administrator credentials',
    );
  const server = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: process.env.HUB_TRUST_PROXY === 'true',
  });
  void server.register(cookie);
  server.addHook('onReady', async () => initializeDatabase(pool));
  const DEFAULT_EXTENSION_ID = 'nhodfnpljikjfeoihaimabljdenmfbio';
  const configuredExtensionId = process.env.HUB_EXTENSION_ID || DEFAULT_EXTENSION_ID;
  if (configuredExtensionId && !/^[a-p]{32}$/.test(configuredExtensionId))
    throw new Error('HUB_EXTENSION_ID must be a Chrome extension ID');
  const extensionOrigin = configuredExtensionId
    ? `chrome-extension://${configuredExtensionId}`
    : null;
  const context: ApiContext = {
    pool,
    configPath,
    extensionOrigin,
    rateLimit: createRateLimiter(options),
  };
  server.addHook('onRequest', async (request, reply) => {
    applySecurityHeaders(reply);
    if (request.url.split('?')[0] === '/api/vault/tickets')
      reply.header('Cache-Control', 'no-store');
    const routePath = request.url.split('?')[0];
    const extensionCatalogRequest =
      request.headers.origin === extensionOrigin &&
      ((routePath === '/api/catalog' && ['GET', 'OPTIONS'].includes(request.method)) ||
        (routePath === '/api/extension/bookmarks' && ['POST', 'OPTIONS'].includes(request.method)));
    if (extensionCatalogRequest) {
      reply.header('Cache-Control', 'no-store');
      reply.header('Access-Control-Allow-Origin', extensionOrigin!);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header(
        'Access-Control-Allow-Methods',
        routePath === '/api/catalog' ? 'GET, OPTIONS' : 'POST, OPTIONS',
      );
      if (request.method === 'OPTIONS') return reply.code(204).send();
      return;
    }
    if (request.url.split('?')[0] !== '/api/vault/exchange') {
      const origin = request.headers.origin;
      if (origin && !origins.includes(origin))
        return reply.code(403).send({ error: 'Origem não autorizada.' });
      if (origin) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
        reply.header('Vary', 'Origin');
        reply.header('Access-Control-Allow-Headers', 'Content-Type');
        reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      }
      if (request.method === 'OPTIONS') return reply.code(204).send();
      if (
        request.headers['sec-fetch-site'] === 'cross-site' &&
        !origin &&
        !['GET', 'HEAD'].includes(request.method)
      )
        return reply.code(403).send({ error: 'Origem não autorizada.' });
      return;
    }
    reply.header('Cache-Control', 'no-store');
    if (extensionOrigin && request.headers.origin === extensionOrigin) {
      reply.header('Access-Control-Allow-Origin', extensionOrigin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
  });
  server.addHook('onClose', async () => {
    await pool.end();
  });
  server.get('/health', async () => ({ status: 'ok' }));
  registerAuthRoutes(server, context);
  registerAdminRoutes(server, context);
  registerCatalogRoutes(server, context);
  registerVaultRoutes(server, context);
  registerConfigRoutes(server, context);
  registerExtensionRoutes(server, context);
  registerPreferencesRoutes(server, context);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.HUB_API_PORT ?? 3177);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('HUB_API_PORT must be a valid TCP port');
  }
  const server = createServer();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void server.close().catch(() => {
        process.exitCode = 1;
      });
    });
  }
  await server.listen({ host: process.env.HUB_API_HOST ?? '127.0.0.1', port });
}
