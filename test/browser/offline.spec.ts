import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('installed app shell and visited results remain readable offline', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'Service worker lifecycle is shared across viewport sizes.');
  await page.route('https://spo.handball4all.de/**', (route) => route.fulfill({ status: 503, body: 'Offline fixture' }));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Dein Spieltag.' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.locator('.game-row').first()).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('api');
    return (await cache.keys()).some((request) => request.url.endsWith('/games.json'));
  })).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Du bist offline.', { exact: true })).toBeVisible();
  await expect(page.locator('.game-row').first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('Du bist offline.', { exact: true })).toHaveCount(0);
});
