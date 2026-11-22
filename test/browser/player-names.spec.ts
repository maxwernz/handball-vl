import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const api = path.resolve('web/public/api');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(api, `${file}.json`), 'utf8'));
const season = read('index').currentSeason;
const stats = read(`s/${season}/stats`);
const player = stats.players.find((p: any) => p.goals > 0 && p.sevenAttempts > 0);
const longName = 'Maximilian Alexander von Musterhausen-Schwarzenberg';

test('long player names remain fully readable in each statistics view', async ({ page }, info) => {
  await page.route('https://spo.handball4all.de/**', (route) => route.fulfill({ status: 503 }));
  await page.route('**/api/s/*/stats*.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.players = [{ ...player, name: longName, games: 4, goals: 10, sevenGoals: 4, warnings: 1, twoMinutes: 3, disqualifications: 1, disqualificationsWithReport: 1 }];
    await route.fulfill({ response, json: data });
  });
  await page.goto('statistik');
  for (const view of ['Torschützen', 'Anteil & Serien', '7-Meter', 'Strafen']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    const link = page.locator('table a').filter({ hasText: longName }).first();
    await expect(link).toBeVisible();
    const dimensions = await link.locator('span.font-medium').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const cell = el.closest('td')!.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { width: rect.width, contentWidth: el.scrollWidth, height: rect.height, contentHeight: el.scrollHeight, cellWidth: cell.width, overflow: style.textOverflow };
    });
    expect(dimensions.cellWidth).toBeGreaterThanOrEqual(160);
    expect(dimensions.overflow).not.toBe('ellipsis');
    expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.width + 1);
    expect(dimensions.contentHeight).toBeLessThanOrEqual(dimensions.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (view === 'Torschützen') {
      const values = await link.locator('xpath=ancestor::tr').getByRole('cell').allTextContents();
      expect(values.slice(-4)).toEqual(['10', '6', '2,5', '1,5']);
    }
    if (view === 'Anteil & Serien') await page.screenshot({ path: info.outputPath('long-player-name.png'), fullPage: true });
    if (view === 'Strafen') await expect(page.getByRole('columnheader', { name: 'Blau' })).toBeVisible();
  }
});
