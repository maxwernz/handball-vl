import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('installed app shell and visited results remain readable offline', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'Service worker lifecycle is shared across viewport sizes.');
  await page.route('https://spo.handball4all.de/**', (route) => route.fulfill({ status: 503, body: 'Offline fixture' }));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Dein Spieltag.' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.locator('.league-group').first()).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('api');
    return (await cache.keys()).some((request) => /\/week\/\d{4}-\d{2}-\d{2}\.json$/.test(request.url));
  })).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Du bist offline.', { exact: true })).toBeVisible();
  await expect(page.locator('.league-group').first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('Du bist offline.', { exact: true })).toHaveCount(0);
});

test('an open installed app checks for newer versions regularly', async ({ page }) => {
  await page.clock.install({ time: Date.now() });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const original = ServiceWorkerRegistration.prototype.update;
    (window as any).pwaUpdateChecks = 0;
    ServiceWorkerRegistration.prototype.update = function () {
      (window as any).pwaUpdateChecks++;
      return original.call(this);
    };
  });
  await page.route('https://spo.handball4all.de/**', (route) => route.fulfill({ status: 503 }));
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const initial = await page.evaluate(() => (window as any).pwaUpdateChecks);
  await page.clock.fastForward(6 * 60_000);
  await expect.poll(() => page.evaluate(() => (window as any).pwaUpdateChecks)).toBeGreaterThan(initial);
});
