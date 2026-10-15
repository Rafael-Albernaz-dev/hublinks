import { readFile, unlink } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const configPath = '/tmp/hublink-e2e-config.json';
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

test.beforeEach(async ({ request }) => {
  const response = await request.put('http://127.0.0.1:3177/api/config', {
    data: initialConfig,
  });
  expect(response.ok()).toBeTruthy();
});

test.afterAll(async () => {
  await unlink(configPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
});

test('initial page displays the default identity and empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tudo o que sua equipe precisa',
  );
  await expect(page.getByText(initialConfig.subtitle)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comece pelos seus links' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Personalizar hub' })).toBeEnabled();
});

test('edits company, RGB and link logo, saves to API, and persists after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
  const panel = page.getByLabel('Personalização do hub');
  await panel.getByLabel('Nome da empresa').fill('Empresa E2E');
  await panel.getByLabel('R', { exact: true }).fill('12');
  await panel.getByLabel('G', { exact: true }).fill('34');
  await panel.getByLabel('B', { exact: true }).fill('56');
  await panel.getByRole('button', { name: '+ Adicionar link' }).click();
  const editor = panel.locator('.link-editor');
  await editor.getByLabel('Nome do link').fill('Portal sintético');
  await editor.getByLabel('Descrição curta').fill('Página pública de teste');
  await editor.getByLabel('Endereço HTTPS').fill('https://example.com/');
  await editor.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: logo,
  });
  await expect(editor.getByAltText('Prévia da logo do card')).toBeVisible();
  await editor.getByRole('button', { name: 'Salvar link' }).click();
  await expect(panel.getByText('Alterações pendentes')).toBeVisible();
  await panel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(panel.getByText('Alterações salvas na API local.')).toBeVisible();

  await page.reload();
  await expect(page.locator('.brand strong')).toHaveText('Empresa E2E');
  await expect(page.locator('.site-shell')).toHaveCSS('--brand', 'rgb(12 34 56)');
  const card = page.getByRole('link', { name: /Portal sintético/ });
  await expect(card).toHaveAttribute('href', 'https://example.com/');
  await expect(card.locator('.card-icon img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.getByText('1 link', { exact: true })).toBeVisible();
});

test('Escape closes the panel and restores focus to its trigger', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Personalizar hub' });
  await trigger.click();
  const close = page.getByRole('button', { name: 'Fechar ajustes' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Personalização do hub')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('cards and customization panel fit desktop and mobile viewports', async ({
  page,
  request,
}) => {
  const response = await request.put('http://127.0.0.1:3177/api/config', {
    data: {
      ...initialConfig,
      links: [
        { id: 'one', title: 'Primeiro', description: '', url: 'https://example.com/' },
        { id: 'two', title: 'Segundo', description: '', url: 'https://example.org/' },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const cards = page.locator('.link-card');
  await expect(cards).toHaveCount(2);
  const desktopFirst = await cards.nth(0).boundingBox();
  const desktopSecond = await cards.nth(1).boundingBox();
  expect(desktopFirst).not.toBeNull();
  expect(desktopSecond).not.toBeNull();
  expect(desktopSecond!.x).toBeGreaterThan(desktopFirst!.x);

  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
  const panel = page.getByLabel('Personalização do hub');
  await expect(panel).toBeVisible();
  const mobileFirst = await cards.nth(0).boundingBox();
  const mobileSecond = await cards.nth(1).boundingBox();
  const panelBox = await panel.boundingBox();
  expect(mobileFirst).not.toBeNull();
  expect(mobileSecond).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(Math.abs(mobileSecond!.x - mobileFirst!.x)).toBeLessThan(2);
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y);
  expect(panelBox!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('exports a version 1 JSON configuration download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Personalizar hub' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('hublink-config.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8'))).toEqual(initialConfig);
});
