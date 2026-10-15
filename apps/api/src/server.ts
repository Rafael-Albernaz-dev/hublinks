import Fastify from 'fastify';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const DEFAULT_CONFIG = {
  version: 1,
  companyName: 'Sua empresa',
  subtitle: 'Seus acessos organizados em um só lugar.',
  color: { r: 31, g: 86, b: 139 },
  logoDataUrl: null,
  links: [],
};

const defaultPath =
  process.env.HUB_CONFIG_PATH ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/config.json');

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Configuration must be an object.');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${name} is invalid.`);
  }
  return value.trim();
}

function image(value: unknown, max: number, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} is invalid.`);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new Error(`${name} is invalid.`);
  const base64 = match[2];
  const bytes =
    (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > max) throw new Error(`${name} exceeds its size limit.`);
  return value;
}

function parseConfig(input: unknown) {
  const config = object(input);
  if (config.version !== 1) throw new Error('Unsupported configuration version.');
  const color = object(config.color);
  for (const key of ['r', 'g', 'b']) {
    if (
      !Number.isInteger(color[key]) ||
      (color[key] as number) < 0 ||
      (color[key] as number) > 255
    ) {
      throw new Error(`Color ${key} must be an integer from 0 to 255.`);
    }
  }
  if (!Array.isArray(config.links) || config.links.length > 30)
    throw new Error('Links are invalid.');
  const ids = new Set<string>();
  const links = config.links.map((entry: unknown) => {
    const link = object(entry);
    const id = string(link.id, 'Link ID', 80);
    if (ids.has(id)) throw new Error('Link IDs must be unique.');
    ids.add(id);
    const url = string(link.url, 'Link URL', 2048);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Link URL must be valid HTTPS.');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Link URL must be public HTTPS without credentials.');
    }
    return {
      id,
      title: string(link.title, 'Link title', 70),
      description: string(link.description, 'Link description', 140, false),
      url: parsed.href,
      ...(link.logoDataUrl === undefined
        ? {}
        : { logoDataUrl: image(link.logoDataUrl, 500_000, 'Card logo') }),
    };
  });
  return {
    version: 1 as const,
    companyName: string(config.companyName, 'Company name', 60),
    subtitle: string(config.subtitle, 'Subtitle', 160, false),
    color: { r: color.r as number, g: color.g as number, b: color.b as number },
    logoDataUrl: image(config.logoDataUrl, 1_000_000, 'Company logo'),
    links,
  };
}

export function createServer(configPath = defaultPath) {
  const server = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  server.get('/health', async () => ({ status: 'ok' }));

  server.get('/api/config', async (_request, reply) => {
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
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.HUB_API_PORT ?? 3177);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('HUB_API_PORT must be a valid TCP port');
  }
  await createServer().listen({ host: '127.0.0.1', port });
}
