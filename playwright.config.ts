import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4181',
    channel: process.platform === 'win32' ? 'msedge' : 'chromium',
  },
  webServer: {
    command: 'npm run preview -- --port 4181',
    port: 4181,
    reuseExistingServer: !process.env.CI,
  },
});
