import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { serviceInput, vaultInput, revealInput, ticketInput } from '../validators/index.js';
import { activeSession, adminSession } from '../services/session.js';
import {
  createVaultService,
  listVaultCredentials,
  upsertVaultCredential,
  revealVaultCredential,
  issueVaultTicket,
  exchangeVaultTicket,
} from '../services/vault.js';

export function registerVaultRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool, extensionOrigin, rateLimit } = context;
  server.options('/api/vault/exchange', async (request, reply) => {
    if (!extensionOrigin || request.headers.origin !== extensionOrigin)
      return reply.code(403).send({ error: 'Origem da extensão não autorizada.' });
    return reply.code(204).send();
  });
  server.post('/api/vault/services', async (request, reply) => {
    const session = await adminSession(pool, request, reply);
    if (!session) return;
    const input = serviceInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do serviço inválidos.' });

    return reply.code(201).send(await createVaultService(pool, session, input, request.ip));
  });

  server.get('/api/vault/credentials', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;

    return listVaultCredentials(pool, session);
  });

  server.put<{ Params: { serviceId: string } }>(
    '/api/vault/credentials/:serviceId',
    async (request, reply) => {
      const session = await activeSession(pool, request, reply);
      if (!session) return;

      const input = vaultInput(request.body);
      if (!input) {
        return reply.code(400).send({ error: 'Dados de credencial inválidos.' });
      }

      const result = await upsertVaultCredential(
        pool,
        session,
        request.params.serviceId,
        input,
        request.ip,
      );
      if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
      return result.value;
    },
  );

  server.post<{ Params: { serviceId: string } }>(
    '/api/vault/credentials/:serviceId/reveal',
    async (request, reply) => {
      const session = await activeSession(pool, request, reply);
      if (!session) return;

      const input = revealInput(request.body);
      if (!input) return reply.code(400).send({ error: 'Parâmetros inválidos.' });

      const result = await revealVaultCredential(
        pool,
        session,
        request.params.serviceId,
        input,
        request.ip,
      );
      if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
      return result.value;
    },
  );

  server.post('/api/vault/tickets', async (request, reply) => {
    if (!rateLimit('tickets', request, reply)) return;
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const input = ticketInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Serviço inválido.' });
    const result = await issueVaultTicket(pool, session, input, request.ip);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return result.value;
  });

  server.post('/api/vault/exchange', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!extensionOrigin || request.headers.origin !== extensionOrigin)
      return reply.code(403).send({ error: 'Origem da extensão não autorizada.' });
    const input = ticketInput(request.body, true);
    if (!input?.ticket) return reply.code(400).send({ error: 'Bilhete inválido.' });
    const result = await exchangeVaultTicket(pool, { ...input, ticket: input.ticket }, request.ip);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return result.value;
  });
}
