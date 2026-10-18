import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { activeSession } from '../services/session.js';
import { preferencesInput } from '../validators/index.js';
import {
  readPreferences,
  updatePreferences,
  resetPreferences,
  companyPreferences,
} from '../services/preferences.js';
export function registerPreferencesRoutes(
  server: FastifyInstance,
  { pool, configPath }: ApiContext,
): void {
  server.get('/api/me/preferences', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    return {
      preferences: await readPreferences(pool, session.id, await companyPreferences(configPath)),
    };
  });
  server.put('/api/me/preferences', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const input = preferencesInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Preferências inválidas.' });
    return {
      preferences: await updatePreferences(
        pool,
        session.id,
        input,
        await companyPreferences(configPath),
      ),
    };
  });
  server.delete('/api/me/preferences', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    return {
      preferences: await resetPreferences(pool, session.id, await companyPreferences(configPath)),
    };
  });
}
