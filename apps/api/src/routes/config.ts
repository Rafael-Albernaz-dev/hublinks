import { activeSession, adminSession } from '../services/session.js';
import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseConfig, DEFAULT_CONFIG } from '../validators/index.js';

export function registerConfigRoutes(server: FastifyInstance, context: ApiContext): void {
  const { configPath } = context;
  server.get('/api/config', async (request, reply) => {
    if (!(await activeSession(context.pool, request, reply))) return;
    try {
      await mkdir(dirname(configPath), { recursive: true });
      try {
        await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      return parseConfig(JSON.parse(await readFile(configPath, 'utf8')));
    } catch {
      return reply.code(500).send({ error: 'Could not read configuration.' });
    }
  });

  server.put('/api/config', async (request, reply) => {
    if (!(await adminSession(context.pool, request, reply))) return;
    let config: ReturnType<typeof parseConfig>;
    try {
      config = parseConfig(request.body);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid configuration.' });
    }
    const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(config, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporaryPath, configPath);
      return { status: 'ok', config };
    } catch {
      await unlink(temporaryPath).catch(() => undefined);
      return reply.code(500).send({ error: 'Could not save configuration.' });
    }
  });
}
