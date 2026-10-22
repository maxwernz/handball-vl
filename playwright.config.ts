import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/handball-vl/',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { channel: 'chromium' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'small-phone-dark', use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium', viewport: { width: 320, height: 640 }, colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    env: { BASE_PATH: '/handball-vl/' },
    url: 'http://127.0.0.1:4173/handball-vl/',
    reuseExistingServer: !process.env.CI,
  },
});
