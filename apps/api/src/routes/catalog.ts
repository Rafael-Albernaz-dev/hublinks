import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { catalogInput } from '../validators/index.js';
import { activeSession } from '../services/session.js';
import {
  listCatalogServices,
  createCatalogService,
  updateCatalogService,
  deleteCatalogService,
} from '../services/catalog.js';
import { discoverServiceFavicon } from '../services/favicon.js';

export function registerCatalogRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool } = context;
  server.get('/api/catalog', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    return { services: await listCatalogServices(pool, session.id) };
  });

  server.post('/api/extension/bookmarks', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (request.headers.origin !== context.extensionOrigin)
      return reply.code(403).send({ error: 'Origem não autorizada.' });
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const body = request.body;
    if (!context.rateLimit('icons', request, reply)) return;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !['name', 'category', 'targetUrl'].includes(key))
    )
      return reply.code(400).send({ error: 'Dados do link inválidos.' });
    const input = catalogInput({ ...body, scope: 'personal', credentialType: 'none' });
    if (!input?.targetUrl) return reply.code(400).send({ error: 'Dados do link inválidos.' });
    // Favicon discovery receives only the origin, never private paths, queries or fragments.
    const favicon = await discoverServiceFavicon(new URL(input.targetUrl).origin);
    input.logoDataUrl = favicon.ok ? favicon.logoDataUrl : null;
    // Discovery may take time; a session revoked while waiting must not authorize a write.
    const current = await activeSession(pool, request, reply);
    if (!current) return;
    const result = await createCatalogService(pool, input, current, request.ip, true);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(201).send({ service: result.value });
  });

  server.post('/api/catalog/services', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const input = catalogInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do card inválidos.' });
    const result = await createCatalogService(pool, input, session, request.ip);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(201).send({ service: result.value });
  });

  server.put<{ Params: { id: string } }>('/api/catalog/services/:id', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const input = catalogInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do card inválidos.' });
    const result = await updateCatalogService(pool, request.params.id, input, session, request.ip);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return { service: result.value };
  });

  server.delete<{ Params: { id: string } }>('/api/catalog/services/:id', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const result = await deleteCatalogService(pool, request.params.id, session, request.ip);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(204).send();
  });

  server.get<{ Querystring: { url?: string } }>('/api/catalog/favicon', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    if (!context.rateLimit('icons', request, reply)) return;
    const result = await discoverServiceFavicon(request.query?.url);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return { logoDataUrl: result.logoDataUrl, host: result.host };
  });
}
