import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { berlinDay, weekStart } from '../../shared/dates.ts';

const api = path.resolve('web/public/api');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(api, `${file}.json`), 'utf8'));
const season = read('index').currentSeason;
const meta = read(`s/${season}/meta`);
const template = read(`s/${season}/games`).find((g: any) => g.homeId && g.guestId);

async function mockWeek(page: import('@playwright/test').Page, games: typeof template[]) {
  const weeks = [...new Set(games.map((game) => weekStart(berlinDay(game.ts))))];
  await page.route('**/api/s/*/meta.json', (route) => route.fulfill({ json: { ...meta, weeks } }));
  await page.route('**/api/s/*/week/*.json', (route) => {
    const week = new URL(route.request().url()).pathname.split('/').at(-1)?.replace('.json', '');
    return route.fulfill({ json: games.filter((game) => weekStart(berlinDay(game.ts)) === week) });
  });
}

test('conference shows a received goal while another ticker is still loading', async ({ page }) => {
  const now = Date.now();
  const games = [0, 1].map((i) => ({ ...template, id: template.id + i, ts: now - 30 * 60_000, status: 'live', liveFlag: true,
    homeGoals: 0, guestGoals: 0, homePoints: null, guestPoints: null, tickerToken: `refresh-${i}` }));
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  let waiting = false;
  await mockWeek(page, games);
  await page.route('https://spo.handball4all.de/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('cmd') === 'getAllTickerMessages') {
      if (url.searchParams.get('token') === 'refresh-1') { waiting = true; await slow; }
      return route.fulfill({ json: [{ game_time: '300', home_score: '1', guest_score: '0', message: 'Tor für die Heimmannschaft durch die Nummer 7' }] });
    }
    if (url.searchParams.get('cmd') === 'getAllGameInfo') return route.fulfill({ json: {} });
    return route.fulfill({ json: [{ content: { score: [], actualGames: [], futureGames: { games: games.map((g) => ({ gID: String(g.id), live: true,
      gToken: g.tickerToken, gHomeGoals: '0', gGuestGoals: '0', gHomePoints: '', gGuestPoints: '' })) } } }] });
  });
  try {
    await page.goto('live');
    await expect.poll(() => waiting).toBe(true);
    const card = page.locator(`.live-scorecard[href$="/spiel/${games[0].id}"]`);
    await expect(card).toContainText('5. Minute', { timeout: 2000 });
    await expect(page.locator('main ol')).toContainText('1:0');
  } finally { release(); }
});

test('received league scores survive a return to the live overview during a slow refresh', async ({ page }) => {
  const now = Date.now();
  const games = [0, 1].map((i) => ({ ...template, id: template.id + i, leagueId: template.leagueId + i,
    ts: now - 30 * 60_000, status: 'scheduled', liveFlag: false, homeGoals: null, guestGoals: null, homePoints: null, guestPoints: null, tickerToken: null }));
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  let waiting = false;
  await mockWeek(page, games);
  await page.route(`**/api/s/*/game/${games[0].id}.json`, (route) => route.fulfill({ json: {
    game: games[0], league: { id: template.leagueId, name: 'Testliga', short: 'M-VL-1-BW' }, report: null, summary: null, previous: [], reportUrl: null,
  } }));
  await page.route('https://spo.handball4all.de/**', async (route) => {
    const url = new URL(route.request().url());
    const second = Number(url.searchParams.get('cl')) === games[1].leagueId;
    if (second) { waiting = true; await slow; }
    const g = games[second ? 1 : 0];
    return route.fulfill({ json: [{ content: { score: [], actualGames: [], futureGames: { games: [{ gID: String(g.id),
      live: true, gToken: '', gHomeGoals: '12', gGuestGoals: '10', gHomePoints: '', gGuestPoints: '' }] } } }] });
  });
  try {
    await page.goto('live');
    await expect.poll(() => waiting).toBe(true);
    const card = page.locator(`.live-scorecard[href$="/spiel/${games[0].id}"]`);
    await expect(card).toContainText('LIVE', { timeout: 2000 });
    await card.click();
    await expect(page.locator('.match-scoreboard')).toContainText('12:10', { timeout: 2000 });
    await page.locator('nav:visible a[href$="/live"]').click();
    await expect(card).toContainText('LIVE', { timeout: 2000 });
    await expect(card).not.toContainText('gleich');
  } finally { release(); }
});
