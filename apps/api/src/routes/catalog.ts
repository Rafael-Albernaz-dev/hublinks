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
    const result = await discoverServiceFavicon(request.query?.url);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return { logoDataUrl: result.logoDataUrl, host: result.host };
  });
}
