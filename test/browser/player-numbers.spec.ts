import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { test, expect, type Locator } from '@playwright/test';
import { buildDatabase } from '../../analysis/build.ts';
import type { GameDetail, League, PlayerStats } from '../../shared/types.ts';

const api = path.resolve('web/public/api');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(api, `${file}.json`), 'utf8'));
const season = read('index').currentSeason;
const players: PlayerStats[] = read(`s/${season}/stats`).players;
const player = players.find((p) => p.team.includes('Nürtingen') && Number(p.no) > 30) ?? players.find((p) => Number(p.no) > 30)!;

// Use the same report as the app, independent of a separately published analysis snapshot.
function analysisFixture() {
  const league: League = read(`s/${season}/league/${player.leagueId}`);
  const detail = league.games.filter((g) => g.status === 'finished').sort((a, b) => b.ts - a.ts)
    .map((g): GameDetail => read(`s/${season}/game/${g.id}`))
    .find((d) => d.report && [d.report.home, d.report.guest].some((s) => s.players.some((p) => p.name === player.name)))!;
  const report = detail.report!;
  const side = detail.game.homeId === player.teamId ? 'home' : 'guest';
  const no = report[side].players.find((p) => p.name === player.name)!.no;
  const olderGame = { ...detail.game, id: detail.game.id + 1_000_000, date: '2000-01-01T12:00', ts: Date.parse('2000-01-01T12:00Z') };
  const olderReport = structuredClone(report);
  olderReport.gameId = olderGame.id;
  olderReport[side].players.find((p) => p.name === player.name)!.no = no === '99' ? '98' : '99';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-player-numbers-'));
  try {
    fs.mkdirSync(path.join(dir, `s${season}`));
    fs.mkdirSync(path.join(dir, 'reports'));
    fs.writeFileSync(path.join(dir, 'seasons.json'), JSON.stringify({ seasons: [{ id: season, name: String(season) }], current: season, updatedAt: report.fetchedAt }));
    fs.writeFileSync(path.join(dir, `s${season}`, `league-${league.id}.json`), JSON.stringify({ ...league, games: [olderGame, detail.game] }));
    for (const r of [olderReport, report]) fs.writeFileSync(path.join(dir, 'reports', `${r.gameId}.json`), JSON.stringify(r));
    const file = path.join(dir, 'handball.db');
    buildDatabase(dir, file);
    return { body: zlib.gzipSync(fs.readFileSync(file)), no };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function expectNumber(table: Locator, name: string, no: string) {
  const headers = await table.locator('thead th').allTextContents();
  const column = headers.findIndex((text) => /^Nr\.?/.test(text));
  expect(column, 'a separate column must show the jersey number from the report').toBeGreaterThanOrEqual(0);
  const row = table.locator('tbody tr').filter({ hasText: name });
  await expect(row.locator('td').nth(column)).toHaveText(no);
  expect(headers[0], 'row position must not be mistaken for a jersey number').toMatch(/Rang|Zeile/);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://spo.handball4all.de/**', (route) => route.fulfill({ status: 503, body: 'Offline fixture' }));
});

test('team squad and statistics show report jersey numbers separately from rank', async ({ page }) => {
  await page.goto(`team/${player.teamId}?tab=squad`);
  let table = page.locator('table').filter({ has: page.locator(`a[href$="/spieler/${player.key}"]`) });
  await expect(table).toBeVisible();
  await expectNumber(table, player.name, player.no);
  await table.getByRole('button', { name: 'Spieler', exact: true }).click();
  await expectNumber(table, player.name, player.no);

  await page.goto('statistik');
  await page.getByRole('combobox', { name: 'Wettbewerb' }).selectOption(String(player.leagueId));
  await page.getByRole('searchbox', { name: 'Spieler oder Team in der Statistik suchen' }).fill(player.name);
  table = page.locator('table').filter({ has: page.locator(`a[href$="/spieler/${player.key}"]`) });
  await expect(table).toBeVisible();
  await expectNumber(table, player.name, player.no);
});

test('analysis player values show report jersey numbers separately from row position', async ({ page }) => {
  const fixture = analysisFixture();
  await page.route('**/analyse/handball.db.gz', (route) => route.fulfill({ body: fixture.body, contentType: 'application/octet-stream' }));
  const meta = read(`s/${season}/meta`);
  const gender = meta.leagues.find((l: { id: number }) => l.id === player.leagueId).short.startsWith('F-') ? 'Frauen' : 'Männer';
  await page.goto(`analyse/#tab=players&s=${season}&g=${gender}&t=${player.teamId}`);
  await page.getByRole('combobox', { name: 'mind. Spiele' }).selectOption('1');
  const table = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Spielerwerte', exact: true }) }).locator('table');
  await expect(table.locator('tbody')).toContainText(player.name);
  await expectNumber(table, player.name, fixture.no);
  await table.getByRole('columnheader', { name: 'Spieler', exact: true }).click();
  await expectNumber(table, player.name, fixture.no);
});
