import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { RawGame, RawScore } from '../shared/h4a.ts';
import type { Game, League, Meta, SiteIndex } from '../shared/types.ts';
import { config } from '../pipeline/config.ts';
import { exportAll } from '../pipeline/export.ts';
import { write } from '../pipeline/store.ts';
import { detailCandidates, keys, shouldRefreshLeague } from '../pipeline/sync.ts';
import { resolveTeamNames } from '../pipeline/teams.ts';

const teams = [
  { teamID: '1', teamName: 'HSG Leinfelden-Echterdingen' },
  { teamID: '2', teamName: 'TuS Steißlingen' },
];
const rawGame = {
  gHomeTeam: 'HSG Lein-Echt', gGuestTeam: 'TuS Steißling.',
  gHomeGoals: '19', gGuestGoals: '36', gHomePoints: '0', gGuestPoints: '2',
} as RawGame;
const table = [
  { tabTeamID: '1', numPlayedGames: 1, numWonGames: 0, numEqualGames: 0, numLostGames: 1, numGoalsShot: 19, numGoalsGot: 36, pointsPlus: 0, pointsMinus: 2 },
  { tabTeamID: '2', numPlayedGames: 1, numWonGames: 1, numEqualGames: 0, numLostGames: 0, numGoalsShot: 36, numGoalsGot: 19, pointsPlus: 2, pointsMinus: 0 },
] as RawScore[];

test('team names resolve from unique exact result records, with blank future scores ignored', () => {
  const future = { ...rawGame, gHomeGoals: ' ', gGuestGoals: ' ', gHomePoints: ' ', gGuestPoints: ' ' };
  assert.deepEqual([...resolveTeamNames(teams, table, [rawGame, future])], [[1, 'HSG Lein-Echt'], [2, 'TuS Steißling.']]);
});

test('ambiguous records never guess an abbreviation', () => {
  const draw = { ...rawGame, gHomeGoals: '20', gGuestGoals: '20', gHomePoints: '1', gGuestPoints: '1' };
  const tied = table.map((r) => ({ ...r, numWonGames: 0, numEqualGames: 1, numLostGames: 0, numGoalsShot: 20, numGoalsGot: 20, pointsPlus: 1, pointsMinus: 1 }));
  assert.equal(resolveTeamNames(teams, tied, [draw]).size, 0);
  assert.equal(resolveTeamNames(teams, [], [{ ...rawGame, gHomeGoals: ' ', gGuestGoals: ' ' }]).size, 0);
});

test('cached or exact names still resolve when the table has not caught up', () => {
  const exact = { ...rawGame, gGuestTeam: 'TuS Steißlingen' };
  assert.deepEqual([...resolveTeamNames(teams, [], [exact], new Map([[1, 'HSG Lein-Echt']]))], [[1, 'HSG Lein-Echt'], [2, 'TuS Steißlingen']]);
  assert.equal(resolveTeamNames(teams, [], [rawGame], new Map([[1, 'Old team name']])).size, 0);
});

test('inactive leagues reuse fresh data and kickoff windows always refresh', () => {
  const now = Date.UTC(2026, 9, 22, 12);
  const league = { updatedAt: new Date(now - 60_000).toISOString(), games: [{ ts: now + 24 * 3600_000 }] } as League;
  assert.equal(shouldRefreshLeague(league, now), false);
  assert.equal(shouldRefreshLeague({ ...league, games: [{ ts: now - 90 * 60_000 }] as Game[] }, now), true);
  assert.equal(shouldRefreshLeague({ ...league, updatedAt: new Date(now - 24 * 3600_000).toISOString() }, now), true);
  assert.equal(shouldRefreshLeague({ ...league, updatedAt: 'invalid' }, now), true);
  assert.equal(shouldRefreshLeague(null, now), true);
});

test('bounded report backfill covers each league before adding older reports', () => {
  const finished = (id: number, ts: number) => ({ id, ts, status: 'finished' }) as Game;
  const leagues = [
    { games: [finished(1, 100), finished(2, 90), { id: 3, ts: 110, status: 'scheduled' }] },
    { games: [finished(4, 80)] },
  ] as League[];
  assert.deepEqual(detailCandidates(leagues).map((g) => g.id), [1, 4, 2]);
  assert.deepEqual(detailCandidates([]), []);
});

test('offline export preserves data freshness and publishes only available league links', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'handball-pipeline-test-'));
  const original = { dataDir: config.dataDir, outDir: config.outDir, fetch: globalThis.fetch };
  config.dataDir = path.join(temporary, 'data');
  config.outDir = path.join(temporary, 'api');
  globalThis.fetch = async () => { throw new Error('Offline export must not access the network'); };
  try {
    const season = 987654;
    const league: League = {
      id: 12, short: 'F-RL-BW', name: 'Frauen-Regionalliga', season,
      updatedAt: '2026-10-18T12:00:00.000Z', sourceUpdated: '18.10.2026',
      teams: [{ id: 100, name: 'Example Team', short: 'Example' }], table: [], tableNotes: [], games: [],
    };
    await write(keys.leagues(season), [league, { id: 13, short: 'M-RL-BW', name: 'Unavailable league' }]);
    await write(keys.league(season, league.id), league);
    const index = { seasons: [{ id: season, name: '2026/27' }], current: season, updatedAt: '2026-10-22T12:00:00.000Z' };
    await exportAll(index, { refreshLogos: false });
    const emittedIndex = JSON.parse(await fs.readFile(path.join(config.outDir, 'index.json'), 'utf8')) as SiteIndex;
    const meta = JSON.parse(await fs.readFile(path.join(config.outDir, `s/${season}/meta.json`), 'utf8')) as Meta;
    assert.equal(emittedIndex.updatedAt, league.updatedAt);
    assert.deepEqual(meta.leagues.map((l) => l.id), [12]);
    assert.deepEqual(meta.logos, {});
    await assert.rejects(exportAll({ ...index, seasons: [{ id: season + 1, name: '2027/28' }] }, { refreshLogos: false }), /No league snapshots/);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(config.outDir, 'index.json'), 'utf8')), emittedIndex, 'a failed export leaves the last valid API intact');
  } finally {
    config.dataDir = original.dataDir;
    config.outDir = original.outDir;
    globalThis.fetch = original.fetch;
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
