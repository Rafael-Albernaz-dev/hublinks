import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { activeSession } from '../services/session.js';
import { agendaCardInput, agendaCardUpdateInput } from '../validators/index.js';
import {
  listAgendaCards,
  createAgendaCard,
  updateAgendaCard,
  deleteAgendaCard,
} from '../services/agenda.js';

export function registerAgendaRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool } = context;

  server.get('/api/agenda', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;

    const cards = await listAgendaCards(pool, session.id);
    return { cards };
  });

  server.post('/api/agenda', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;

    const input = agendaCardInput(request.body);
    if (!input) {
      return reply.code(400).send({ error: 'Título do card inválido.' });
    }

    const card = await createAgendaCard(pool, session.id, input);
    return reply.code(201).send(card);
  });

  server.put<{ Params: { id: string } }>('/api/agenda/:id', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;

    const input = agendaCardUpdateInput(request.body);
    if (!input) {
      return reply.code(400).send({ error: 'Nenhum dado válido para atualização fornecido.' });
    }

    const result = await updateAgendaCard(pool, session.id, request.params.id, input);
    if (!result.ok) {
      return reply.code(result.statusCode).send({ error: result.error });
    }

    return reply.code(200).send(result.value);
  });

  server.delete<{ Params: { id: string } }>('/api/agenda/:id', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (!session) return;

    const result = await deleteAgendaCard(pool, session.id, request.params.id);
    if (!result.ok) {
      return reply.code(result.statusCode).send({ error: result.error });
    }

    return reply.code(200).send(result.value);
  });
}
