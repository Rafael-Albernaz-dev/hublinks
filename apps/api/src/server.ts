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
  const server = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
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
    if (request.url.split('?')[0] !== '/api/vault/exchange') return;
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
  await createServer().listen({ host: '127.0.0.1', port });
}
