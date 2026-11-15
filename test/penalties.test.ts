import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { config } from '../pipeline/config.ts';
import { parseReport } from '../pipeline/report.ts';
import { seasonData } from '../pipeline/stats.ts';
import { write } from '../pipeline/store.ts';
import { keys } from '../pipeline/sync.ts';
import type { Game, League } from '../shared/types.ts';

test('player and team totals retain three suspensions, red and the blue subset', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-penalties-'));
  const previous = config.dataDir;
  config.dataDir = temporary;
  try {
    const report = await parseReport(new Uint8Array(await fs.readFile(new URL('./fixtures/penalties-synthetic.pdf', import.meta.url))), 9384291, 3537261, { home: 'Test Heim', guest: 'Test Gast' });
    const line = report.home.players.find((p) => p.name === 'Test Spieler')!;
    line.disqualificationReport = line.disqualification;
    const game = { id: report.gameId, leagueId: 10, homeId: 100, guestId: 200, home: report.home.name, guest: report.guest.name,
      homeGoals: 6, guestGoals: 0, date: '2026-10-18T18:00', ts: Date.parse('2026-10-18T16:00Z'), status: 'finished' } as Game;
    const league = { id: 10, season: 999991, short: 'M-RL-BW', updatedAt: '2026-11-15T10:00Z',
      teams: [{ id: 100, name: game.home }, { id: 200, name: game.guest }], games: [game] } as League;
    await write(keys.leagues(league.season), [league]);
    await write(keys.league(league.season, league.id), league);
    await write(keys.report(game.id), report);
    const data = await seasonData(league.season);
    const player = [...data.players.values()].find((p) => p.name === line.name)!;
    assert.equal(player.twoMinutes, 3);
    assert.equal(player.disqualifications, 1);
    assert.equal(player.disqualificationsWithReport, 1);
    assert.equal(player.log[0].disqualificationReport, true);
    assert.equal(data.teams.get(100)!.twoMinutes, 4); // three for Test Spieler, one for Test Zweiter
    assert.equal(data.teams.get(100)!.disqualifications, 1);
    assert.equal(data.teams.get(100)!.disqualificationsWithReport, 1);
  } finally {
    config.dataDir = previous;
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
