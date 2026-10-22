import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const api = path.resolve('web/public/api');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(api, `${file}.json`), 'utf8'));
const season = read('index').currentSeason;
const meta = read(`s/${season}/meta`);
const stats = read(`s/${season}/stats`);
const games = read(`s/${season}/games`);
const reported = games.map((game: { id: number }) => read(`s/${season}/game/${game.id}`)).find((detail: any) => detail.report);

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page must not overflow horizontally').toBe(true);
}

test.beforeEach(async ({ page }) => {
  // Browser tests must never poll the real handball provider.
  await page.route('https://spo.handball4all.de/**', (route) => route.fulfill({ status: 503, body: 'Offline fixture' }));
});

test('match center, league discovery, filters and favorites work', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Dein Spieltag.' })).toBeVisible();
  await expect(page.locator('.game-row').first()).toBeVisible();
  await fits(page);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await page.getByRole('button', { name: 'Favoriten bearbeiten' }).click();
  await expect(page.getByRole('heading', { name: 'Deine Favoriten' })).toBeVisible();
  const favorite = page.locator('.favorite-option').first();
  await favorite.click();
  await expect(page.locator('.favorite-option[aria-pressed="true"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(page.locator('.favorite-team').first()).toBeVisible();
  await page.goto('ligen');
  await expect(page.getByRole('heading', { name: 'Alle Ligen', exact: true })).toBeVisible();
  await expect(page.locator('.league-directory-row')).toHaveCount(meta.leagues.length);
  await page.getByRole('button', { name: 'Frauen', exact: true }).click();
  await expect(page.locator('.league-directory-row')).toHaveCount(meta.leagues.filter((l: any) => l.short.startsWith('F-')).length);
  await page.getByRole('searchbox').fill('Regionalliga');
  await expect(page.locator('.league-directory-row')).toHaveCount(1);
  await fits(page);
  await page.screenshot({ path: info.outputPath('leagues.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('detail pages, tabs, search and comparison stay usable at every viewport', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const routes = [`liga/${meta.leagues[0].id}`, `team/${meta.teams[0].id}`, `spiel/${reported.game.id}`, `spieler/${stats.players[0].key}`, 'statistik', 'suche', 'vergleich', 'live'];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1').first()).toBeAttached();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await fits(page);
    if (route.startsWith('spiel/')) {
      await page.getByRole('tab', { name: 'Ticker', exact: true }).click();
      await expect(page.locator('main')).not.toContainText('61. Minute');
      await page.screenshot({ path: info.outputPath('game.png'), fullPage: true });
      await page.getByRole('tab', { name: 'Statistik', exact: true }).click();
      await fits(page);
    }
  }
  await page.goto('suche');
  await page.getByRole('searchbox').fill(meta.teams[0].name);
  await expect(page.locator('main a[href*="/team/"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('primary pages meet automated accessibility checks', async ({ page }) => {
  for (const route of ['./', 'ligen', `liga/${meta.leagues[0].id}`, `spiel/${reported.game.id}`, 'statistik']) {
    await page.goto(route);
    await expect(page.locator('main h1').first()).toBeAttached();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target, summary: n.failureSummary })) })), route).toEqual([]);
  }
});

test('failed bootstrap has a working retry instead of an endless spinner', async ({ page }) => {
  await page.route('**/api/index.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('./');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.unroute('**/api/index.json');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Spieltag.' })).toBeVisible();
});

test('60:00, final whistle, navigation and report arrival preserve the completed match', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const game = { ...reported.game, ts: now - 85 * 60_000, status: 'live', liveFlag: true, homeGoals: 24, guestGoals: 31, homePoints: null, guestPoints: null, tickerToken: 'regression-token' };
  const sourceMessages = JSON.parse(fs.readFileSync('test/fixtures/ticker-messages.json', 'utf8'));
  let ended = false;
  let reportArrived = false;
  await page.route('**/api/s/*/games.json', (route) => route.fulfill({ json: [game] }));
  await page.route(`**/api/s/*/game/${game.id}.json`, (route) => route.fulfill({ json: { ...reported, game: reportArrived ? { ...game, status: 'finished', liveFlag: false, homePoints: 0, guestPoints: 2 } : game, report: reportArrived ? reported.report : null, summary: null } }));
  await page.route('https://spo.handball4all.de/**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('cmd') === 'getAllTickerMessages') return route.fulfill({ json: ended ? [...sourceMessages, sourceMessages.at(-2)] : sourceMessages.slice(0, -1) });
    if (url.searchParams.get('cmd') === 'getAllGameInfo') return route.fulfill({ json: JSON.parse(fs.readFileSync('test/fixtures/ticker-teams.json', 'utf8')) });
    return route.fulfill({ json: [{ content: { score: [], actualGames: [], futureGames: { games: [{ gID: String(game.id), live: true, gToken: game.tickerToken, gHomeGoals: '24', gGuestGoals: '31', gHomeGoals_1: '11', gGuestGoals_1: '19', gHomePoints: '', gGuestPoints: '' }] } } }] });
  });
  await page.goto(`spiel/${game.id}`);
  await expect(page.getByText('60. Minute', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('61. Minute');
  ended = true;
  await page.clock.fastForward(21_000);
  await expect(page.getByText('ENDSTAND', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Ticker', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Live-Ticker', exact: true })).toHaveCount(0);
  await page.locator('nav:visible').getByRole('link', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gerade beendet' })).toBeVisible();
  await page.locator(`.live-scorecard[href$="/spiel/${game.id}"]`).click();
  await expect(page.getByText('ENDSTAND', { exact: true })).toBeVisible();
  await page.clock.fastForward(301_000);
  await page.locator('nav:visible').getByRole('link', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gerade beendet' })).toBeVisible();
  await page.locator(`.live-scorecard[href$="/spiel/${game.id}"]`).click();
  await expect(page.getByText('ENDSTAND', { exact: true })).toBeVisible();
  reportArrived = true;
  await page.clock.fastForward(301_000);
  await expect(page.getByText('ENDSTAND', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Aufstellung' }).click();
  await expect(page.locator('main a[href*="/spieler/"]').first()).toBeVisible();
  await fits(page);
});

test('PWA manifest and deep-link assets resolve under the deployment path', async ({ page, request }) => {
  await page.goto(`spiel/${reported.game.id}`);
  const manifestURL = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(manifestURL!)).json();
  expect(manifest.short_name).toBe('Handball BW');
  expect(manifest.display).toBe('standalone');
  for (const selector of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
    const href = await page.locator(selector).getAttribute('href');
    expect((await request.get(href!)).status()).toBe(200);
  }
});

test('a failed live score poll keeps the last received score', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const game = { ...reported.game, ts: now - 45 * 60_000, status: 'live', liveFlag: true, homeGoals: 11, guestGoals: 19, homePoints: null, guestPoints: null, tickerToken: null };
  let failed = false;
  await page.route('**/api/s/*/games.json', (route) => route.fulfill({ json: [game] }));
  await page.route(`**/api/s/*/game/${game.id}.json`, (route) => route.fulfill({ json: { ...reported, game, report: null, summary: null } }));
  await page.route('https://spo.handball4all.de/**', (route) => failed ? route.fulfill({ status: 503, body: 'Provider unavailable' }) : route.fulfill({ json: [{ content: { score: [], actualGames: [], futureGames: { games: [{ gID: String(game.id), live: true, gToken: '', gHomeGoals: '24', gGuestGoals: '30', gHomeGoals_1: '11', gGuestGoals_1: '19', gHomePoints: '', gGuestPoints: '' }] } } }] }));
  await page.goto(`spiel/${game.id}`);
  await expect(page.locator('.match-scoreboard')).toContainText('24:30');
  failed = true;
  await page.clock.fastForward(21_000);
  await expect(page.locator('.match-scoreboard')).toContainText('24:30');
  await expect(page.locator('.match-scoreboard')).not.toContainText('11:19');
});
