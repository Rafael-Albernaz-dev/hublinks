import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5177',
    browserName: 'chromium',
    headless: true,
  },
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:3178/health',
      reuseExistingServer: false,
      env: {
        HUB_API_PORT: '3178',
        HUB_CONFIG_PATH: '/tmp/hublink-e2e-config.json',
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ??
          `postgres://hublink:hublink_dev_password@127.0.0.1:${process.env.HUB_DB_PORT ?? '5439'}/hublink_e2e`,
      },
    },
    {
      command: 'npm run dev:web',
      url: 'http://127.0.0.1:5177',
      reuseExistingServer: false,
    },
  ],
});
