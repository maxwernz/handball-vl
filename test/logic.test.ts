// Derived numbers the app shows: live table, forecast and team notes.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Game, League, TableRow, TeamStats } from '../shared/types.ts';
import { forecast } from '../web/src/lib/forecast.ts';
import { teamNotes } from '../web/src/lib/notes.ts';
import { liveTable, remainingSchedules } from '../web/src/lib/standings.ts';

const row = (teamId: number, rank: number, played: number, pointsPlus: number, pointsMinus: number, goalsFor: number, goalsAgainst: number): TableRow => ({
  rank, teamId, team: `T${teamId}`, played, won: 0, drawn: 0, lost: 0, goalsFor, goalsAgainst, pointsPlus, pointsMinus,
});
let ts = 0;
const game = (homeId: number, guestId: number, homeGoals: number | null, guestGoals: number | null, status: Game['status']) =>
  ({ id: ++ts, ts, homeId, guestId, homeGoals, guestGoals, status }) as Game;
const league = (table: TableRow[], games: Game[]) => ({ table, games, teams: table.map((r) => ({ id: r.teamId, name: r.team, short: null })) }) as League;

test('live table counts a running game exactly once', () => {
  const games = [game(1, 4, 30, 20, 'finished'), game(2, 3, 25, 24, 'finished'), game(3, 1, 15, 10, 'live')];
  const expected = [[2, 1], [1, -1], [3, 0], [4, 0]];
  const moves = (l: League) => liveTable(l).map((r) => [r.teamId, r.move]);
  // h4a's table without the running game …
  assert.deepEqual(moves(league([row(1, 1, 1, 2, 0, 30, 20), row(2, 2, 1, 2, 0, 25, 24), row(3, 3, 1, 0, 2, 24, 25), row(4, 4, 1, 0, 2, 20, 30)], games)), expected);
  // … and with it already counted.
  assert.deepEqual(moves(league([row(3, 1, 2, 2, 2, 39, 35), row(2, 2, 1, 2, 0, 25, 24), row(1, 3, 2, 2, 2, 40, 35), row(4, 4, 1, 0, 2, 20, 30)], games)), expected);
});

test('remaining schedule ranks the harder run-in first', () => {
  const table = [row(1, 1, 0, 0, 0, 0, 0), row(2, 2, 0, 0, 0, 0, 0), row(3, 3, 0, 0, 0, 0, 0), row(4, 4, 0, 0, 0, 0, 0)];
  const rest = remainingSchedules(league(table, [game(4, 1, null, null, 'scheduled'), game(4, 2, null, null, 'scheduled'), game(3, 4, null, null, 'scheduled')]));
  assert.deepEqual([rest.get(4)!.games, rest.get(4)!.home, rest.get(4)!.avgRank, rest.get(4)!.topHalf, rest.get(4)!.difficulty], [3, 2, 2, 2, 1]);
  assert.equal(rest.get(3)!.difficulty, 2);
});

test('forecast favours the stronger team and adds up to 1', () => {
  const team = (goalsFor: number, goalsAgainst: number, form: TeamStats['form']) => ({ played: 5, goalsFor, goalsAgainst, form }) as TeamStats;
  const strong = team(160, 130, ['W', 'W', 'W', 'D', 'W']);
  const weak = team(125, 155, ['L', 'L', 'D', 'L', 'L']);
  const f = forecast(strong, weak)!;
  assert.ok(f.home > 0.8 && f.guest < 0.1);
  assert.ok(Math.abs(f.home + f.draw + f.guest - 1) < 1e-9);
  assert.ok(forecast(weak, strong)!.home < 0.3);
  const even = forecast(strong, strong)!;
  assert.ok(even.home > even.guest, 'home advantage');
  assert.equal(forecast({ ...strong, played: 1 } as TeamStats, weak), null);
});

test('team notes', () => {
  const results = (list: [boolean, number, number][]) => list.map(([home, own, other]) => (home ? game(1, 2, own, other, 'finished') : game(2, 1, other, own, 'finished')));
  assert.deepEqual(teamNotes(results([[true, 30, 20], [false, 30, 20], [true, 30, 20]]), 1), ['Alle 3 Spiele gewonnen']);
  assert.deepEqual(teamNotes(results([[true, 20, 30], [false, 20, 30], [false, 20, 30], [false, 40, 20]]), 1), ['Erster Saisonsieg', '100. Saisontor im letzten Spiel']);
  assert.deepEqual(teamNotes(results([[true, 20, 30], [true, 25, 25], [false, 20, 30], [true, 20, 30]]), 1), ['Seit 4 Spielen ohne Sieg']);
  assert.deepEqual(teamNotes([], 1), []);
});
