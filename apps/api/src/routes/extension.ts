import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { activeSession } from '../services/session.js';
import { buildExtensionZipBuffer } from '../services/extensionPackage.js';
export function registerExtensionRoutes(server: FastifyInstance, { pool }: ApiContext): void {
  server.get('/api/extension/package', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!(await activeSession(pool, request, reply))) return;
    try {
      const zip = await buildExtensionZipBuffer();
      return reply
        .type('application/zip')
        .header('Content-Disposition', 'attachment; filename="hublink-chrome-extension.zip"')
        .send(zip);
    } catch {
      return reply.code(503).send({
        error:
          'Pacote indisponível. Execute npm run build para gerar a extensão e tente novamente.',
      });
    }
  });
}
