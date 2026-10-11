// The live ticker parser against the recorded ticker of a full game.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { activePenalties, parseTicker } from '../web/src/lib/liveTicker.ts';

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
