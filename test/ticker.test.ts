// The live ticker parser against the recorded ticker of a full game.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { activePenalties, applyTickerResult, liveScore, matchClock, matchMinute, parseTicker } from '../web/src/lib/liveTicker.ts';
import type { Game } from '../shared/types.ts';
import { gameStatus } from '../shared/h4a.ts';

const read = (name: string) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const messages = read('ticker-messages.json');
const teams = read('ticker-teams.json');

test('ticker: full game', () => {
  const game = parseTicker(messages, teams);
  assert.deepEqual([game.homeGoals, game.guestGoals, game.phase], [24, 31, 'Ende']);
  const count = (type: string) => game.events.filter((e) => e.type === type).length;
  assert.equal(count('goal') + count('sevenGoal'), 55);
  assert.equal(count('sevenMiss'), 1);
  assert.equal(count('timeout'), 5);
  assert.deepEqual(
    game.events.slice(0, 2).map((e) => [e.clock, e.type, e.side, e.player]),
    [['01:55', 'goal', 'guest', 'Leo Staudenmaier'], ['03:02', 'sevenGoal', 'home', 'Maxime Weh']],
  );
  const weh = game.home.players.find((p) => p.name === 'Maxime Weh')!;
  assert.deepEqual([weh.goals, weh.sevenGoals, weh.sevenAttempts], [8, 2, 3]);
  assert.equal(game.home.players.reduce((n, p) => n + p.goals, 0), 24);
});

test('ticker: phases and running penalties', () => {
  const early = parseTicker(messages.slice(0, 8), teams);
  assert.equal(early.phase, '6. Minute');
  assert.deepEqual(activePenalties(early, 'home'), [{ player: 'Martin Denecke', until: '07:17' }]);
  assert.deepEqual(activePenalties(parseTicker(messages.slice(0, 12), teams), 'home'), []);
  const half = messages.findIndex((m: { message: string }) => m.message === 'Spielstand 1. Halbzeit');
  assert.equal(parseTicker(messages.slice(0, half + 1), teams).phase, 'Halbzeit');
});

test('ticker: works without the lineups', () => {
  const game = parseTicker(messages);
  assert.equal(game.events[0].player, 'Nr. 95');
  assert.equal(game.guest.players.reduce((n, p) => n + p.goals, 0), 31);
});

test('ticker: the regulation clock at 60:00 never becomes the 61st minute', () => {
  const stopped = { game_time: '3600', home_score: '24', guest_score: '31', message: 'Spielzeit gestoppt' };
  assert.equal(parseTicker([stopped]).phase, '60. Minute');
});

test('ticker: a trailing clock message does not undo the final whistle', () => {
  const final = messages.at(-1);
  assert.equal(parseTicker([final, { ...final, message: 'Spielzeit gestoppt' }]).phase, 'Ende');
});

test('ticker: the final whistle ends the displayed live match immediately', () => {
  const game = { status: 'live', homeGoals: 24, guestGoals: 30 } as Game;
  const displayed = { ...game, ...liveScore(game, parseTicker(messages, teams)) };
  assert.equal(displayed.status, 'finished');
  assert.equal(displayed.guestGoals, 31);
});

test('ticker: older scores cannot replace a newer score for either team', () => {
  const game = { status: 'live', homeGoals: 25, guestGoals: 30 } as Game;
  assert.equal(liveScore(game, parseTicker(messages, teams)), null);
});

test('ticker: minute boundaries and actual extra time remain accurate', () => {
  for (const [seconds, expected] of [[0, 1], [59, 1], [60, 1], [61, 2], [1799, 30], [1800, 30], [3599, 60], [3600, 60], [3601, 61], [4200, 70]]) {
    assert.equal(matchMinute(seconds), expected, `${seconds} seconds`);
  }
  assert.equal(matchClock(3600), '60:00');
  assert.equal(matchClock(4200), '70:00');
  const final = messages.at(-1);
  assert.equal(parseTicker([final, { ...final, game_time: '3601', message: 'Spielzeit gestartet' }]).phase, '61. Minute');
});

test('ticker: halftime survives administrative rows and clears when play resumes', () => {
  const half = { game_time: '1800', home_score: '11', guest_score: '19', message: 'Spielstand 1. Halbzeit' };
  assert.equal(parseTicker([half, { ...half, message: 'Spielzeit gestoppt' }]).phase, 'Halbzeit');
  assert.notEqual(parseTicker([half, { ...half, message: 'Spielzeit gestartet' }]).phase, 'Halbzeit');
});

test('ticker: empty and damaged messages do not invent a live score or NaN clock', () => {
  assert.equal(parseTicker([]).phase, 'Vor dem Anwurf');
  const good = { game_time: '305', home_score: '4', guest_score: '6', message: 'Spielzeit gestartet' };
  const damaged = { game_time: 'NaN', home_score: '', guest_score: 'Infinity', message: 'Spielzeit gestoppt' };
  const ticker = parseTicker([good, damaged]);
  assert.deepEqual([ticker.homeGoals, ticker.guestGoals, ticker.clock], [4, 6, 305]);
  assert.equal(liveScore({ status: 'live', homeGoals: null, guestGoals: null } as Game, parseTicker([])), null);
});

test('ticker: an official completed result takes precedence over cached ticker data', () => {
  const game = { status: 'finished', homeGoals: 25, guestGoals: 31, liveFlag: false } as Game;
  assert.equal(applyTickerResult(game, parseTicker(messages, teams)), game);
});

test('ticker: final whistle clears running penalties immediately', () => {
  const penalty = { game_time: '3590', home_score: '24', guest_score: '31', message: '2-min Strafe für die Nummer 2 der Heimmannschaft' };
  assert.equal(activePenalties(parseTicker([penalty]), 'home').length, 1);
  assert.deepEqual(activePenalties(parseTicker([penalty, messages.at(-1)]), 'home'), []);
});

test('ticker: cached final score survives the live window expiring before publication', () => {
  const ticker = parseTicker(messages, teams);
  for (const liveFlag of [true, false]) {
    const source = { ts: 0, homeGoals: 11, guestGoals: 19, liveFlag, homePoints: null, guestPoints: null } as Game;
    const expired = { ...source, status: gameStatus(source, 151 * 60_000) };
    assert.equal(expired.status, 'finished');
    const result = applyTickerResult(expired, ticker);
    assert.deepEqual([result.homeGoals, result.guestGoals, result.status], [24, 31, 'finished']);
  }
});

test('ticker: an awarded official result can correct the final score downwards', () => {
  const official = { status: 'finished', homeGoals: 23, guestGoals: 30, liveFlag: false, homePoints: 0, guestPoints: 2 } as Game;
  assert.equal(applyTickerResult(official, parseTicker(messages, teams)), official);
});
