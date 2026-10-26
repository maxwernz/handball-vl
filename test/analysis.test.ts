import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildDatabase } from '../analysis/build.ts';
import { checkSql } from '../analysis/server.ts';
import { videoTimestamps } from '../analysis/video.ts';
import { playersDown, shortages, strengthPhases } from '../shared/strength.ts';
import type { Game, League, MatchEvent, Report } from '../shared/types.ts';

let score = { home: 0, guest: 0 };
function ev(clock: string, type: MatchEvent['type'], side: 'home' | 'guest', player = 'Spieler'): MatchEvent {
  const [m, s] = clock.split(':').map(Number);
  if (type === 'goal' || type === 'sevenGoal') score = { ...score, [side]: score[side] + 1 };
  return { clock, t: m * 60 + s, type, side, player, no: '7', homeScore: score.home, guestScore: score.guest, text: '' };
}

test('a third 2-minute penalty with its red card is one shortage, 2+2 lasts four minutes', () => {
  score = { home: 0, guest: 0 };
  const events = [ev('10:00', 'twoMinutes', 'home', 'A'), ev('10:00', 'disqualification', 'home', 'A'), ev('20:00', 'twoMinutes', 'guest', 'B'), ev('20:00', 'twoMinutes', 'guest', 'B')];
  const list = shortages(events);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((s) => [s.side, s.start, s.end, s.type]), [['home', 600, 720, 'disqualification'], ['guest', 1200, 1440, 'twoMinutes']]);
});

test('players down and strength phases follow overlapping penalties', () => {
  score = { home: 0, guest: 0 };
  const events = [
    ev('10:00', 'twoMinutes', 'home', 'A'),
    ev('10:30', 'goal', 'guest'),
    ev('11:00', 'twoMinutes', 'home', 'C'),
    ev('11:30', 'goal', 'home'),
    ev('11:40', 'twoMinutes', 'guest', 'B'),
    ev('11:50', 'goal', 'guest'), // home 2 down (A, C), guest 1 down (B)
    ev('12:30', 'goal', 'home'), // A is back: 1 against 1
    ev('13:30', 'goal', 'home'), // C is back, B still out
  ];
  const list = shortages(events);
  assert.deepEqual(playersDown(list, events, 1), { home: 1, guest: 0 });
  assert.deepEqual(playersDown(list, events, 5), { home: 2, guest: 1 });
  assert.deepEqual(playersDown(list, events, 6), { home: 1, guest: 1 });
  assert.deepEqual(playersDown(list, events, 7), { home: 0, guest: 1 });
  assert.deepEqual(strengthPhases(list), [{ short: 'home', start: 600, end: 720, difference: 2 }, { short: 'guest', start: 780, end: 820, difference: 1 }]);
});

test('the analysis database holds games, events from both sides and short-handed phases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-analysis-'));
  score = { home: 0, guest: 0 };
  const events = [ev('05:00', 'goal', 'home', 'Max'), ev('10:00', 'twoMinutes', 'home', 'Max'), ev('10:30', 'goal', 'home', 'Max'), ev('11:00', 'goal', 'guest', 'Tom'), ev('31:00', 'timeout', 'guest', null as unknown as string)];
  const game = { id: 1, reportId: 9, no: '1', leagueId: 10, date: '2026-10-24T19:30', ts: 0, round: 1, venue: null, home: 'TSV A', guest: 'SG B', homeId: 100, guestId: 200,
    homeGoals: 2, guestGoals: 1, homeGoalsHt: 2, guestGoalsHt: 1, homePoints: 2, guestPoints: 0, liveFlag: false, status: 'finished', comment: '', hasSummary: false } as Game;
  const league = { id: 10, short: 'M-VL-4-BW', name: 'Männer-Verbandsliga Staffel 4', season: 142, updatedAt: '', sourceUpdated: '', tableNotes: [],
    teams: [{ id: 100, name: 'TSV A', short: 'A' }, { id: 200, name: 'SG B', short: 'B' }], table: [], games: [game] } as League;
  const line = (name: string, goals: number) => ({ no: '7', name, goals, sevenGoals: 0, sevenAttempts: 0, warning: null, twoMinutes: name === 'Max' ? ['10:00'] : [], disqualification: null, official: false });
  const report: Report = { gameId: 1, reportId: 9, fetchedAt: '', spectators: 120, referees: ['X', 'Y'], events,
    home: { name: 'TSV A', players: [line('Max', 2)], officials: [] }, guest: { name: 'SG B', players: [line('Tom', 1)], officials: [] } };
  fs.writeFileSync(path.join(dir, 'seasons.json'), JSON.stringify({ seasons: [{ id: 142, name: '2026/27' }], current: 142, updatedAt: '2026-10-25T00:00:00Z' }));
  fs.mkdirSync(path.join(dir, 's142'));
  fs.mkdirSync(path.join(dir, 'reports'));
  fs.writeFileSync(path.join(dir, 's142', 'league-10.json'), JSON.stringify(league));
  fs.writeFileSync(path.join(dir, 'reports', '1.json'), JSON.stringify(report));
  const file = path.join(dir, 'db.sqlite');
  assert.deepEqual(buildDatabase(dir, file), { games: 1, reports: 1 });

  const db = new DatabaseSync(file, { readOnly: true });
  const all = (sql: string) => db.prepare(sql).all().map((row) => ({ ...row }));
  assert.deepEqual(all("SELECT gender, level, staffel FROM leagues"), [{ gender: 'Männer', level: 'VL', staffel: 4 }]);
  assert.deepEqual(all("SELECT team_id, result FROM team_games ORDER BY team_id"), [{ team_id: 100, result: 'S' }, { team_id: 200, result: 'N' }]);
  assert.deepEqual(all("SELECT team_id, situation, start_clock, end_clock, goals_for, goals_against, penalized FROM strength_phases ORDER BY team_id"), [
    { team_id: 100, situation: 'shorthanded', start_clock: '10:00', end_clock: '12:00', goals_for: 1, goals_against: 1, penalized: 'Max (10:00)' },
    { team_id: 200, situation: 'powerplay', start_clock: '10:00', end_clock: '12:00', goals_for: 1, goals_against: 1, penalized: 'Max (10:00)' },
  ]);
  assert.deepEqual(all("SELECT clock, by_team, strength, lead_before FROM team_events WHERE team_id = 200 AND type = 'goal' ORDER BY seq"), [
    { clock: '05:00', by_team: 0, strength: 'even', lead_before: 0 },
    { clock: '10:30', by_team: 0, strength: 'powerplay', lead_before: -1 },
    { clock: '11:00', by_team: 1, strength: 'powerplay', lead_before: -2 },
  ]);
  assert.deepEqual(all("SELECT half, minute FROM events WHERE type = 'timeout'"), [{ half: 2, minute: 32 }]);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('only reading queries reach the database', () => {
  assert.equal(checkSql('SELECT 1'), null);
  assert.equal(checkSql('  with x as (select 1) select * from x;'), null);
  assert.ok(checkSql('DELETE FROM games'));
  assert.ok(checkSql("ATTACH 'x.db' AS x"));
  assert.ok(checkSql("SELECT 1; ATTACH 'x.db' AS x"));
});

test('game times become video positions per half', () => {
  assert.deepEqual(videoTimestamps({ times: ['22:05', '47:20'], first_half_kickoff: '3:10', second_half_kickoff: '1:00:00', lead_seconds: 30 }), [
    { game_time: '22:05', video_time: '25:15', clip_start: '24:45', clip_end: '27:15' },
    { game_time: '47:20', video_time: '1:17:20', clip_start: '1:16:50', clip_end: '1:19:20' },
  ]);
  assert.throws(() => videoTimestamps({ times: ['40:00'], first_half_kickoff: '0:00' }), /2\. Halbzeit/);
});
