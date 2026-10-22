import assert from 'node:assert/strict';
import test from 'node:test';
import { matchStats } from '../web/src/lib/matchStats.ts';
import { parseTicker } from '../web/src/lib/liveTicker.ts';

test('live statistics only credit time already played', () => {
  const ticker = parseTicker([
    { game_time: '120', home_score: '1', guest_score: '0', message: 'Tor für die Heimmannschaft durch die Nummer 7' },
    { game_time: '300', home_score: '1', guest_score: '0', message: 'Spielzeit gestoppt' },
  ]);
  const stats = matchStats(ticker);
  assert.equal(stats.flow.duration, 300);
  assert.equal(stats.home.timeLeading, 180);
  assert.equal(stats.guest.timeLeading, 0);
});

test('finished report statistics include the time from the final goal to full time', () => {
  const { home, guest, events } = parseTicker([
    { game_time: '120', home_score: '1', guest_score: '0', message: 'Tor für die Heimmannschaft durch die Nummer 7' },
  ]);
  const stats = matchStats({ home, guest, events });
  assert.equal(stats.flow.duration, 3600);
  assert.equal(stats.home.timeLeading, 3480);
});
