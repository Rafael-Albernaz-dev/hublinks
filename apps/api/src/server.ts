import Fastify from 'fastify';

const server = Fastify({ logger: true });

// Only process readiness is exposed. No catalog, user or secret data exists yet.
server.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env.HUB_API_PORT ?? 3177);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('HUB_API_PORT must be a valid TCP port');
}

await server.listen({ host: '127.0.0.1', port });
