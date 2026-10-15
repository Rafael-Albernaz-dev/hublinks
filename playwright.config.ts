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
      url: 'http://127.0.0.1:3177/health',
      reuseExistingServer: !process.env.CI,
      env: { HUB_CONFIG_PATH: '/tmp/hublink-e2e-config.json' },
    },
    {
      command: 'npm run dev:web',
      url: 'http://127.0.0.1:5177',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
