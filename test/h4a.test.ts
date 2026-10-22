import assert from 'node:assert/strict';
import test from 'node:test';
import { gameStatus, isActive, num, rawGames, type LeagueResponse, type RawGame } from '../shared/h4a.ts';
import type { Game } from '../shared/types.ts';

const kickoff = Date.UTC(2026, 9, 22, 18);

test('status: a future fixture with a prepared ticker remains scheduled', () => {
  assert.equal(gameStatus({ ts: kickoff, homeGoals: 0, guestGoals: 0, liveFlag: true }, kickoff - 3600_000), 'scheduled');
});

test('status: awarded points and a cleared live flag confirm a finished result', () => {
  const game = { ts: kickoff, homeGoals: 24, guestGoals: 31, homePoints: 0, guestPoints: 2, liveFlag: false } as Game;
  assert.equal(gameStatus(game, kickoff + 85 * 60_000), 'finished');
});

test('status: a stale live flag cannot keep yesterday’s game active', () => {
  const game = { ts: kickoff, status: 'live', homeGoals: 24, guestGoals: 31, liveFlag: true } as Game;
  assert.equal(isActive(game, kickoff + 24 * 3600_000), false);
});

test('league: current results survive when the provider moves them out of futureGames', () => {
  const before = { gID: '123', gHomeGoals: '23' } as RawGame;
  const final = { ...before, gHomeGoals: '24' };
  const next = { gID: '124', gHomeGoals: '' } as RawGame;
  const response = { content: { futureGames: { games: [before, next] }, actualGames: { games: [final] } } } as LeagueResponse;
  assert.deepEqual(rawGames(response), [final, next]);
  assert.deepEqual(rawGames({ content: { futureGames: [], actualGames: { games: [final] } } } as LeagueResponse), [final]);
});

test('numbers: missing and non-finite provider values never become scores', () => {
  assert.equal(num(' '), null);
  assert.equal(num('Infinity'), null);
  assert.equal(num('NaN'), null);
  assert.equal(num('0'), 0);
});
