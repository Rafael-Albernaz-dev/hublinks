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
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

test.beforeEach(async ({ page, request }) => {
  await page.route('**/api/**', async (route) => {
    const target = new URL(route.request().url());
    const response = await route.fetch({ url: `${apiBase}${target.pathname}${target.search}` });
    await route.fulfill({ response });
  });
  const response = await request.put(`${apiBase}/api/config`, {
    data: initialConfig,
  });
  expect(response.ok()).toBeTruthy();
});

test.afterAll(async () => {
  await unlink(configPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
});

test('initial page displays identity and private catalog state', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tudo o que sua equipe precisa',
  );
  await expect(page.getByText(initialConfig.subtitle)).toBeVisible();
  await expect(
    page
      .locator('.link-card')
      .first()
      .or(page.getByRole('heading', { name: 'Catálogo vazio' })),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Personalizar hub' })).toBeEnabled();
});

test('edits branding and creates a private card with a logo', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
  const panel = page.getByLabel('Personalização do hub');
  await panel.getByLabel('Nome da empresa').fill('Empresa E2E');
  await panel.getByLabel('R', { exact: true }).fill('12');
  await panel.getByLabel('G', { exact: true }).fill('34');
  await panel.getByLabel('B', { exact: true }).fill('56');
  await panel.getByRole('button', { name: '+ Adicionar card' }).click();
  const editor = panel.locator('.link-editor');
  await editor.getByLabel('Nome do serviço/card').fill('Portal sintético');
  await editor.getByLabel('Descrição curta').fill('Página pública de teste');
  await editor.getByLabel('Endereço HTTPS').fill('https://example.com/');
  await editor.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: logo,
  });
  await expect(editor.getByAltText('Prévia da logo do card')).toBeVisible();
  await editor.getByRole('button', { name: 'Salvar card' }).click();
  await expect(panel.getByText('Alterações pendentes')).toBeVisible();
  await panel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(panel.getByText('Alterações salvas na API local.')).toBeVisible();

  await page.reload();
  await expect(page.locator('.brand strong')).toHaveText('Empresa E2E');
  await expect(page.locator('.site-shell')).toHaveCSS('--brand', 'rgb(12 34 56)');
  const card = page.getByRole('link', { name: /Portal sintético/ });
  await expect(card).toHaveAttribute('href', 'https://example.com/');
  await expect(card.locator('.card-icon img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  const pool = new pg.Pool({
    connectionString:
      process.env.E2E_DATABASE_URL ??
      `postgres://hublink:hublink_dev_password@127.0.0.1:${process.env.HUB_DB_PORT ?? '5439'}/hublink_e2e`,
  });
  try {
    await pool.query('DELETE FROM services WHERE name = $1', ['Portal sintético']);
  } finally {
    await pool.end();
  }
});

test('Escape closes the panel and restores focus to its trigger', async ({ page }) => {
  await page.goto('/');
  await login(page);
  const trigger = page.getByRole('button', { name: 'Personalizar hub' });
  await trigger.click();
  const close = page.getByRole('button', { name: 'Fechar ajustes' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Personalização do hub')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('cards and customization panel fit desktop and mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await login(page);
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
  const panel = page.getByLabel('Personalização do hub');
  for (const name of ['Primeiro layout', 'Segundo layout']) {
    await panel.getByRole('button', { name: '+ Adicionar card' }).click();
    const editor = panel.locator('.catalog-editor');
    await editor.getByLabel('Nome do serviço/card').fill(name);
    await editor.getByLabel('Endereço HTTPS').fill('https://example.test/');
    await editor.getByRole('button', { name: 'Salvar card' }).click();
    await expect(panel.getByText('Card salvo no catálogo privado.')).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Fechar ajustes' }).click();
  const cards = page.locator('.link-card');
  await expect(cards.first()).toBeVisible();
  const desktopFirst = await page.getByRole('link', { name: /Primeiro layout/ }).boundingBox();
  const desktopSecond = await page.getByRole('link', { name: /Segundo layout/ }).boundingBox();
  expect(desktopFirst).not.toBeNull();
  expect(desktopSecond).not.toBeNull();
  expect(desktopSecond!.x).toBeGreaterThan(desktopFirst!.x);

  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
  await expect(panel).toBeVisible();
  const mobileFirst = await page.getByRole('link', { name: /Primeiro layout/ }).boundingBox();
  const mobileSecond = await page.getByRole('link', { name: /Segundo layout/ }).boundingBox();
  const panelBox = await panel.boundingBox();
  expect(mobileFirst).not.toBeNull();
  expect(mobileSecond).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(Math.abs(mobileSecond!.x - mobileFirst!.x)).toBeLessThan(2);
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y);
  expect(panelBox!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  for (const name of ['Primeiro layout', 'Segundo layout']) {
    page.once('dialog', (dialog) => dialog.accept());
    await panel
      .getByText(name, { exact: true })
      .last()
      .locator('..')
      .locator('..')
      .getByRole('button', { name: 'Excluir' })
      .click();
  }
});

test('exports a version 1 JSON configuration download', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
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
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no Hublink' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Seus links' })).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'Seus links' })).toHaveCount(0);
  } finally {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await pool.end();
  }
});
