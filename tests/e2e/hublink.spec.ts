import { readFile, unlink } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import pg from 'pg';

const configPath = '/tmp/hublink-e2e-config.json';
const apiBase = 'http://127.0.0.1:3178';
const logo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
  'base64',
);
const initialConfig = {
  version: 1,
  companyName: 'Sua empresa',
  subtitle: 'Seus acessos organizados em um só lugar.',
  color: { r: 31, g: 86, b: 139 },
  logoDataUrl: null,
  links: [],
};

async function login(
  page: Page,
  email = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
  password = process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
) {
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar no Hublink' }).click();
  await expect(page.getByRole('button', { name: /Menu do usuário/ })).toBeVisible();
}

test.beforeEach(async ({ page, request }) => {
  await page.route('**/api/**', async (route) => {
    const target = new URL(route.request().url());
    const response = await route.fetch({ url: `${apiBase}${target.pathname}${target.search}` });
    await route.fulfill({ response });
  });
  const auth = await request.post(`${apiBase}/api/auth/login`, {
    data: {
      email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
      password: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
    },
  });
  expect(auth.ok()).toBeTruthy();
  const response = await request.put(`${apiBase}/api/config`, {
    data: initialConfig,
  });
  expect(response.ok()).toBeTruthy();
  const preferences = await request.delete(`${apiBase}/api/me/preferences`);
  expect(preferences.ok()).toBeTruthy();
});

test.afterAll(async () => {
  await unlink(configPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
});

const createdServiceIds: string[] = [];
function navigate(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Telas do Workspace' })
    .getByRole('button', { name, exact: true })
    .click();
}

async function createService(page: Page, name: string, withLogo = false) {
  await navigate(page, 'Catálogo');
  await page.getByRole('button', { name: '+ Adicionar serviço', exact: true }).click();
  const editor = page.locator('.catalog-editor');
  await editor.getByLabel('Nome do serviço/card').fill(name);
  await editor.getByRole('combobox', { name: /^Categoria/ }).selectOption('sheet');
  await editor.getByLabel('Descrição curta').fill('Página pública de teste');
  await editor.getByLabel('Endereço HTTPS', { exact: true }).fill('https://example.com/');
  if (withLogo) {
    await editor
      .locator('input[type="file"]')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
    await expect(editor.getByAltText('Prévia da logo do card')).toBeVisible();
  }
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/catalog/services' &&
      response.request().method() === 'POST',
  );
  await editor.getByRole('button', { name: 'Salvar card', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  createdServiceIds.push((await response.json()).service.id as string);
  await expect(editor).toHaveCount(0);
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
  if (!createdServiceIds.length) return;
  const pool = new pg.Pool({
    connectionString:
      process.env.E2E_DATABASE_URL ??
      `postgres://hublink:hublink_dev_password@127.0.0.1:${process.env.HUB_DB_PORT ?? '5439'}/hublink_e2e`,
  });
  try {
    await pool.query('DELETE FROM services WHERE id = ANY($1::text[])', [createdServiceIds]);
  } finally {
    createdServiceIds.length = 0;
    await pool.end();
  }
});

test('initial page displays identity and private catalog state', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Um bom dia começa aqui.');
  await expect(page.getByText(initialConfig.subtitle, { exact: true })).toBeVisible();
  await expect(
    page
      .locator('.hb-service')
      .first()
      .or(page.getByRole('heading', { name: 'Catálogo vazio' })),
  ).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Telas do Workspace' });
  for (const name of ['Início', 'Catálogo', 'Acessos', 'Equipe', 'Personalização'])
    await expect(nav.getByRole('button', { name, exact: true })).toBeEnabled();
  await navigate(page, 'Acessos');
  await expect(page.getByRole('heading', { name: 'Acessos da equipe', exact: true })).toBeVisible();
  await navigate(page, 'Equipe');
  await expect(
    page.getByRole('heading', { name: 'Equipe e permissões', exact: true }),
  ).toBeVisible();
});

test('edits branding and creates a private card with a logo', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await navigate(page, 'Personalização');
  await page.getByLabel('Nome da empresa', { exact: true }).fill('Empresa E2E');
  await page.getByRole('textbox', { name: 'RGB', exact: true }).fill('12, 34, 56');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText('Alterações salvas na API local.')).toBeVisible();
  await createService(page, 'Portal sintético', true);
  await page.reload();
  await expect(page.locator('.hb-brand')).toContainText('Empresa E2E');
  await expect(page.locator('.site-shell')).toHaveCSS('--brand', 'rgb(12 34 56)');
  const card = page.getByRole('link', { name: 'Abrir Portal sintético', exact: true });
  await expect(card).toHaveAttribute('href', 'https://example.com/');
  await expect(card.locator('.hb-logo img')).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('cancel or Escape closes the service modal dialog and restores focus to trigger', async ({
  page,
}) => {
  await page.goto('/');
  await login(page);
  await navigate(page, 'Catálogo');
  const trigger = page.getByRole('button', { name: '+ Adicionar serviço', exact: true });
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Novo serviço' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('cards and workspace views fit desktop and mobile viewports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await login(page);
  for (const name of ['Primeiro layout', 'Segundo layout']) await createService(page, name);
  await navigate(page, 'Início');
  const first = page.getByRole('link', { name: 'Abrir Primeiro layout', exact: true });
  const second = page.getByRole('link', { name: 'Abrir Segundo layout', exact: true });
  await page.getByRole('textbox', { name: 'Buscar serviços no Workspace' }).fill('layout');
  const desktopFirst = await first.boundingBox();
  const desktopSecond = await second.boundingBox();
  expect(desktopFirst).not.toBeNull();
  expect(desktopSecond).not.toBeNull();
  expect(desktopSecond!.x).toBeGreaterThan(desktopFirst!.x);
  expect(Math.abs(desktopSecond!.y - desktopFirst!.y)).toBeLessThan(2);
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await navigate(page, 'Catálogo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  for (const name of ['Primeiro layout', 'Segundo layout']) {
    await page
      .locator('.catalog-management-record')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Excluir', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: `Excluir ${name}` })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
    await expect(page.locator('.catalog-management-record').filter({ hasText: name })).toHaveCount(
      0,
    );
  }
});

test('exports a version 1 JSON configuration download', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await navigate(page, 'Personalização');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('hublink-config.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8'))).toEqual(initialConfig);
});

test('login persists across reload and logout blocks links again', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar no Hublink' })).toBeVisible();
  await login(page);
  await page.reload();
  await expect(page.getByRole('button', { name: /Menu do usuário/ })).toBeVisible();
  await page.getByRole('button', { name: /Menu do usuário/ }).click();
  await page.getByRole('menuitem', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no Hublink' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Telas do Workspace' })).toHaveCount(0);
  await expect(page.locator('.hb-service')).toHaveCount(0);
});

test('admin password reset blocks an attendant session on reload', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const password = 'synthetic-password-123';
  const pool = new pg.Pool({
    connectionString:
      process.env.E2E_DATABASE_URL ??
      `postgres://hublink:hublink_dev_password@127.0.0.1:${process.env.HUB_DB_PORT ?? '5439'}/hublink_e2e`,
  });
  try {
    const adminLogin = await request.post(`${apiBase}/api/auth/login`, {
      data: {
        email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
        password: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
      },
    });
    expect(adminLogin.ok()).toBeTruthy();
    const created = await request.post(`${apiBase}/api/admin/users`, {
      data: {
        displayName: 'Synthetic Attendant',
        email,
        password,
      },
    });
    expect(created.status()).toBe(201);
    const id: string = (await created.json()).user.id;
    await page.goto('/');
    await login(page, email, password);
    const reset = await request.post(`${apiBase}/api/admin/users/${id}/reset-password`, {
      data: { password: 'new-synthetic-password-123' },
    });
    expect(reset.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrar no Hublink' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Telas do Workspace' })).toHaveCount(0);
    await expect(page.locator('.hb-service')).toHaveCount(0);
  } finally {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await pool.end();
  }
});

test('own profile persists identity, photo and a password change through a new login', async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const email = `profile-e2e-${suffix}@example.test`;
  const updatedEmail = `profile-updated-e2e-${suffix}@example.test`;
  const created = await request.post(`${apiBase}/api/admin/users`, {
    data: { displayName: 'Synthetic Profile', email, password: 'synthetic-profile-123' },
  });
  expect(created.status()).toBe(201);
  const id: string = (await created.json()).user.id;
  const pool = new pg.Pool({
    connectionString:
      process.env.E2E_DATABASE_URL ??
      `postgres://hublink:hublink_dev_password@127.0.0.1:${process.env.HUB_DB_PORT ?? '5439'}/hublink_e2e`,
  });
  try {
    await page.goto('/');
    await login(page, email, 'synthetic-profile-123');
    await page.getByRole('button', { name: /Menu do usuário/ }).click();
    await page.getByRole('menuitem', { name: 'Meu Perfil' }).click();
    await page.getByLabel('Nome de exibição').fill('Updated Synthetic Profile');
    await page.getByLabel('E-mail').fill(updatedEmail);
    await page
      .getByLabel('Foto do perfil')
      .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: logo });
    await expect(page.getByAltText('Prévia do perfil')).toBeVisible();
    await page.getByLabel('Senha atual', { exact: true }).fill('synthetic-profile-123');
    await page.getByLabel('Nova senha', { exact: true }).fill('synthetic-updated-123');
    await page.getByLabel('Confirmar nova senha', { exact: true }).fill('synthetic-updated-123');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Perfil atualizado com sucesso.')).toBeVisible();
    await page.getByRole('button', { name: 'Menu do usuário: Updated Synthetic Profile' }).click();
    await page.getByRole('menuitem', { name: 'Sair da conta' }).click();
    await login(page, updatedEmail, 'synthetic-updated-123');
    await page.reload();
    const trigger = page.getByRole('button', {
      name: 'Menu do usuário: Updated Synthetic Profile',
    });
    await expect(trigger.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Meu Perfil' }).click();
    await expect(page.getByLabel('E-mail')).toHaveValue(updatedEmail);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await pool.end();
  }
});
