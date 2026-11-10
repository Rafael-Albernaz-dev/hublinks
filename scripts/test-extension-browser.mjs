import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import pg from 'pg';
import { configureManifest } from '../apps/extension/build-config.mjs';
import { supportedLoginForms, rejectedLoginForms } from '../tests/fixtures/loginForms.ts';

// Only disposable loopback databases are accepted. No developer profile, provider or real account.
const databaseUrl = process.env.EXTENSION_TEST_DATABASE_URL;
assert.ok(
  databaseUrl,
  'Set EXTENSION_TEST_DATABASE_URL to a disposable loopback PostgreSQL database.',
);
const database = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
assert.match(database.pathname, /^\/hublink_extension_.*test$/);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'hublink-extension-browser-'));
const profile = join(directory, 'profile');
const extensionPath = join(directory, 'extension');
const evidence = [];
const failures = [];
let context, api, gateway, pool;
const createdServiceIds = [];
let apiPort;
const testUser = 'synthetic.user@example.test';
const testPassword = 'synthetic-password-for-browser-only';
const adminEmail = 'browser-admin@example.test';
const adminPassword = 'synthetic-admin-for-browser-only';
const htmlByPath = new Map();
let origin, destinationOrigin;

async function scenario(name, action) {
  try {
    await action();
    evidence.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    // Do not serialize request/response bodies, cookies or traces containing credentials.
    failures.push(name);
    evidence.push({ name, status: 'FAIL', errorType: error.name });
    console.log(`FAIL ${name} (${error.name})`);
  }
}

try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      join(directory, 'tls.key'),
      '-out',
      join(directory, 'tls.pem'),
      '-subj',
      '/CN=hub.hublink.test',
      '-addext',
      'subjectAltName=DNS:*.hublink.test',
    ],
    { stdio: 'pipe' },
  );
  const cert = await readFile(join(directory, 'tls.pem'));
  const pin = createHash('sha256')
    .update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' }))
    .digest('base64');
  gateway = createHttpsServer(
    { key: await readFile(join(directory, 'tls.key')), cert },
    async (req, res) => {
      try {
        const path = new URL(req.url, 'https://fixture.test').pathname;
        if (path.startsWith('/api/') || path === '/health') {
          const upstream = httpRequest(
            {
              host: '127.0.0.1',
              port: apiPort,
              path: req.url,
              method: req.method,
              headers: { ...req.headers, 'x-forwarded-proto': 'https' },
            },
            (response) => {
              res.writeHead(response.statusCode, response.headers);
              response.pipe(res);
            },
          );
          upstream.on('error', () => {
            res.writeHead(502);
            res.end();
          });
          req.pipe(upstream);
          return;
        }
        if (path === '/redirect-away') {
          res.writeHead(302, { Location: `${destinationOrigin}/forms/redirected` });
          res.end();
          return;
        }
        if (htmlByPath.has(path)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(
            `<!doctype html><html><head><title>Synthetic login</title></head><body>${htmlByPath.get(path)}<script>window.submitCount=0;document.addEventListener('submit',e=>{e.preventDefault();window.submitCount++});document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('[data-next]'))window.submitCount++});</script></body></html>`,
          );
          return;
        }
        const staticPath = path.startsWith('/assets/') ? path.slice(1) : 'index.html';
        assert.ok(!staticPath.includes('..'));
        const bytes = await readFile(join(root, 'apps/web/dist', staticPath));
        res.setHeader(
          'Content-Type',
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.html': 'text/html',
            '.svg': 'image/svg+xml',
          }[extname(staticPath)] ?? 'application/octet-stream',
        );
        res.end(bytes);
      } catch {
        res.writeHead(404);
        res.end();
      }
    },
  );
  await new Promise((resolve, reject) => {
    gateway.once('error', reject);
    gateway.listen(0, '127.0.0.1', resolve);
  });
  const port = gateway.address().port;
  origin = `https://hub.hublink.test:${port}`;
  destinationOrigin = `https://login.hublink.test:${port}`;
  process.env.HUB_CLIENT_ORIGINS = origin;
  process.env.HUB_TRUST_PROXY = 'true';
  process.env.INITIAL_ADMIN_EMAIL = adminEmail;
  process.env.INITIAL_ADMIN_PASSWORD = adminPassword;
  process.env.VAULT_MASTER_KEY = 'a'.repeat(64);
  process.env.HUB_SEED_PILOT = 'false';
  process.env.NODE_ENV = 'test';
  const { createServer } = await import('../apps/api/dist/server.js');
  pool = new pg.Pool({ connectionString: databaseUrl });
  api = createServer(join(directory, 'config.json'), pool);
  await api.listen({ host: '127.0.0.1', port: 0 });
  apiPort = api.server.address().port;
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM services')).rows[0].count,
    0,
    'Use an empty disposable catalog for browser tests.',
  );

  await cp(join(root, 'apps/extension/static'), extensionPath, { recursive: true });
  const manifest = configureManifest(
    JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8')),
    origin,
  );
  await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  await build({
    entryPoints: ['background', 'autofill', 'content', 'popup'].map((name) =>
      join(root, `apps/extension/src/${name}.ts`),
    ),
    outdir: extensionPath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    define: { __HUB_EXTENSION_ORIGIN__: JSON.stringify(origin) },
  });

  const auth = await api.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: adminEmail, password: adminPassword },
  });
  assert.equal(auth.statusCode, 200);
  const cookie = auth.headers['set-cookie'].split(';')[0];
  const allCases = [
    ...supportedLoginForms.map((item) => ({ ...item, filled: true })),
    {
      name: 'open shadow root',
      filled: true,
      html: `<div id="host"></div><script>document.getElementById('host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(supportedLoginForms[1].html)}</script>`,
    },
    {
      name: 'shadow-root human OTP',
      filled: true,
      challenge: true,
      html: `<div id="host"></div><script>document.getElementById('host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(supportedLoginForms[0].html.replace('</form>', '<input autocomplete="one-time-code"></form>'))}</script>`,
    },
    {
      name: 'slow SPA after two seconds',
      filled: true,
      html: `<div id="mount"></div><script>setTimeout(()=>document.getElementById('mount').innerHTML=${JSON.stringify(supportedLoginForms[1].html)},2000)</script>`,
    },
    {
      name: 'two-step SPA',
      filled: true,
      step: true,
      html: '<form id="step"><input data-login-user autocomplete="username"><button data-next type="button" onclick="document.getElementById(\'step\').innerHTML=\'<input data-login-password type=password autocomplete=current-password>\'">Avançar</button></form>',
    },
    ...rejectedLoginForms.map((item) => ({ ...item, filled: false })),
    {
      name: 'two-step human OTP',
      filled: false,
      step: true,
      otpStep: true,
      html: '<form id="step"><input data-login-user autocomplete="username"><button data-next type="button" onclick="document.getElementById(\'step\').innerHTML=\'<input type=password autocomplete=one-time-code name=otp>\'">Avançar</button></form>',
    },
  ];
  const cases = process.env.EXTENSION_TEST_CASE_FILTER
    ? allCases.filter((item) => item.name.includes(process.env.EXTENSION_TEST_CASE_FILTER))
    : allCases;
  assert.ok(cases.length, 'The browser case filter matched no forms.');
  const services = [];
  async function service(name, targetUrl, credentialType = 'individual', saveCredential = true) {
    const made = await api.inject({
      method: 'POST',
      url: '/api/catalog/services',
      headers: { cookie },
      payload: { name, category: 'sistemas', credentialType, targetUrl },
    });
    assert.equal(made.statusCode, 201);
    const result = made.json().service;
    createdServiceIds.push(result.id);
    if (credentialType !== 'none' && saveCredential) {
      const saved = await api.inject({
        method: 'PUT',
        url: `/api/vault/credentials/${result.id}`,
        headers: { cookie },
        payload: { username: testUser, password: testPassword },
      });
      assert.equal(saved.statusCode, 200);
    }
    return result;
  }
  for (const [index, item] of cases.entries()) {
    const path = `/forms/case-${index}`;
    htmlByPath.set(path, item.html);
    services.push(
      await service(
        `Synthetic ${String(index).padStart(2, '0')} ${item.name}`,
        `${destinationOrigin}${path}`,
      ),
    );
  }
  htmlByPath.set('/forms/redirected', supportedLoginForms[0].html);
  const redirect = await service('Synthetic redirected origin', `${origin}/redirect-away`);
  const direct = await service(
    'Synthetic direct link',
    `${destinationOrigin}/forms/case-0`,
    'none',
  );
  const missing = await service(
    'Synthetic missing credential',
    `${destinationOrigin}/forms/case-0`,
    'individual',
    false,
  );

  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: process.env.EXTENSION_TEST_HEADED !== 'true',
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--host-resolver-rules=MAP *.hublink.test 127.0.0.1',
      `--ignore-certificate-errors-spki-list=${pin}`,
      '--no-proxy-server',
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).hostname;
  const hub = await context.newPage();
  const pageErrors = [];
  hub.on('pageerror', (error) => pageErrors.push(error.name));
  await hub.goto(origin);
  await hub.getByRole('textbox', { name: 'E-mail' }).fill(adminEmail);
  await hub.getByLabel('Senha', { exact: true }).fill(adminPassword);
  await hub.getByRole('button', { name: 'Entrar no Hublink' }).click();
  await expect(hub.getByRole('button', { name: 'Extensão ativa' })).toBeVisible();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#quick-shortcuts button')).toHaveCount(services.length + 3);
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openings = [];
  async function openFrom(surface, item) {
    // Exercise the normal rate limit rather than disabling it for a fast matrix.
    while (openings.length && openings[0] < Date.now() - 60_000) openings.shift();
    if (openings.length >= 28) {
      await new Promise((resolve) => setTimeout(resolve, 60_050 - (Date.now() - openings[0])));
      while (openings.length && openings[0] < Date.now() - 60_000) openings.shift();
    }
    openings.push(Date.now());
    const source =
      surface === 'card'
        ? hub.getByRole('link', { name: new RegExp(escaped(item.name)) })
        : popup
            .locator('#quick-shortcuts button')
            .filter({ has: popup.locator('strong', { hasText: item.name }) });
    const opened = context.waitForEvent('page');
    await source.click();
    const destination = await opened;
    await destination.waitForLoadState('domcontentloaded');
    return destination;
  }
  for (const [index, item] of cases.entries()) {
    for (const surface of item.filled || item.otpStep ? ['card', 'popup'] : ['card']) {
      await scenario(`${surface}: ${item.name}`, async () => {
        const destination = await openFrom(surface, services[index]);
        try {
          if (item.step) {
            await expect(destination.locator('[data-login-user]')).toHaveValue(testUser);
            await destination.locator('[data-next]').click();
          }
          if (item.filled) {
            await expect(destination.locator('[data-login-password]')).toHaveValue(testPassword, {
              timeout: 12_000,
            });
            if (!item.step)
              await expect(destination.locator('[data-login-user]')).toHaveValue(testUser);
            await expect(destination.locator('#hublink-autofill-toast')).toBeVisible();
            if (item.challenge) {
              await expect(destination.locator('#hublink-autofill-toast')).toHaveAttribute(
                'data-hublink-toast',
                'filled_pending_challenge',
              );
              await expect(destination.locator('[autocomplete="one-time-code"]')).toHaveValue('');
            }
          } else {
            if (surface === 'popup') {
              await expect(popup.locator('#popup-notice')).toContainText('Destino aberto.', {
                timeout: 15_000,
              });
            } else {
              await expect(
                hub.getByRole('status').filter({
                  hasText: item.otpStep ? 'Usuário preenchido' : 'Não foi possível reconhecer',
                }),
              ).toBeVisible({ timeout: 15_000 });
            }
            assert.equal(
              await destination
                .locator('input')
                .evaluateAll((inputs) => inputs.some((input) => input.value)),
              false,
            );
          }
          assert.equal(await destination.evaluate(() => window.submitCount), 0);
          await expect(hub.getByRole('dialog', { name: 'Central da Extensão' })).toHaveCount(0);
        } finally {
          await destination.close();
        }
      });
    }
  }
  await scenario('popup: credential-free links bypass the vault', async () => {
    const destination = await openFrom('popup', direct);
    try {
      await expect(destination.locator('[data-login-password]')).toHaveValue('');
    } finally {
      await destination.close();
    }
  });
  await scenario('popup: missing credential does not open a destination', async () => {
    const before = context.pages().length;
    await popup.locator('#quick-shortcuts button').filter({ hasText: missing.name }).click();
    await expect(popup.locator('#popup-notice')).toContainText('Cadastre sua credencial');
    assert.equal(context.pages().length, before);
  });
  await scenario('card: cross-origin redirects receive no credential', async () => {
    const destination = await openFrom('card', redirect);
    try {
      await expect(
        hub.getByRole('status').filter({ hasText: 'Não foi possível reconhecer' }),
      ).toBeVisible();
      await expect(destination.locator('[data-login-password]')).toHaveValue('');
      await expect(destination.locator('[data-login-user]')).toHaveValue('');
    } finally {
      await destination.close();
    }
  });
  await scenario('extension stores only the existing boolean preferences', async () => {
    const stored = await worker.evaluate(() => chrome.storage.local.get(null));
    assert.ok(
      Object.keys(stored).every((key) =>
        ['openOnStartup', 'openOnNewTab', 'showToastNotifications'].includes(key),
      ),
    );
  });
  await scenario('desktop/mobile and light/dark keep access feedback nonmodal', async () => {
    for (const theme of ['light', 'dark']) {
      await hub.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      for (const width of [1440, 390]) {
        await hub.setViewportSize({ width, height: 900 });
        assert.ok(await hub.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await hub.evaluate(() => window.scrollTo(0, 0));
        await expect(hub.getByRole('dialog', { name: 'Central da Extensão' })).toHaveCount(0);
        await hub.screenshot({ path: join(directory, `workspace-${theme}-${width}.png`) });
      }
    }
    assert.deepEqual(pageErrors, []);
  });
  await scenario(
    'browser without extension: access stays inline and installation is explicit',
    async () => {
      const browser = await chromium.launch({
        channel: 'chromium',
        headless: true,
        args: [
          '--host-resolver-rules=MAP *.hublink.test 127.0.0.1',
          `--ignore-certificate-errors-spki-list=${pin}`,
          '--no-proxy-server',
        ],
      });
      try {
        const page = await browser.newPage();
        await page.goto(origin);
        await page.getByRole('textbox', { name: 'E-mail' }).fill(adminEmail);
        await page.getByLabel('Senha', { exact: true }).fill(adminPassword);
        await page.getByRole('button', { name: 'Entrar no Hublink' }).click();
        await expect(page.getByRole('button', { name: 'Instalar extensão' })).toBeVisible();
        await page.getByRole('link', { name: new RegExp(escaped(services[0].name)) }).click();
        await expect(
          page.getByRole('status').filter({ hasText: 'Extensão indisponível' }),
        ).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByRole('button', { name: 'Instalar extensão' }).click();
        await expect(page.getByRole('dialog', { name: 'Central da Extensão' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      } finally {
        await browser.close();
      }
    },
  );
  await scenario('popup: revoked Hub session cannot issue another ticket', async () => {
    // Revoke only the disposable database's sessions; the popup must recheck its cookie.
    const client = new pg.Pool({ connectionString: databaseUrl });
    try {
      await client.query('UPDATE sessions SET revoked_at=NOW()');
    } finally {
      await client.end();
    }
    const before = context.pages().length;
    await popup.locator('#quick-shortcuts button').filter({ hasText: services[0].name }).click();
    await expect(popup.locator('#popup-notice')).toContainText('Entre novamente');
    assert.equal(context.pages().length, before);
  });
} finally {
  await context?.close();
  if (pool && createdServiceIds.length)
    await pool.query('DELETE FROM services WHERE id=ANY($1::text[])', [createdServiceIds]);
  await api?.close();
  if (gateway)
    await new Promise((resolve) => {
      gateway.closeAllConnections();
      gateway.close(resolve);
    });
  await rm(profile, { recursive: true, force: true });
  await rm(extensionPath, { recursive: true, force: true });
  await rm(join(directory, 'tls.key'), { force: true });
  await rm(join(directory, 'tls.pem'), { force: true });
  await rm(join(directory, 'config.json'), { force: true });
  await writeFile(join(directory, 'results.json'), JSON.stringify({ evidence, failures }, null, 2));
  console.log(`Browser evidence: ${directory}`);
}
assert.deepEqual(failures, [], 'Browser scenarios failed; see the sanitized evidence.');
