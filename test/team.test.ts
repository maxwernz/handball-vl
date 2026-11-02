import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classify, detectFile, eventTotals, parseFiles } from '../team/lib/parse.ts';
import { open, passwordKey, seal, toB64, randomBytes, WrongKeyError } from '../team/lib/crypto.ts';
import { bestCandidate, candidates } from '../team/lib/match.ts';
import { players, summarize } from '../team/lib/stats.ts';
import { buildGame } from '../team/lib/game.ts';
import { Store } from '../team/store.ts';
import config from '../team/config.json' with { type: 'json' };
import type { TeamBundle } from '../team/lib/model.ts';

// Real export of one game (names anonymised): 25:30, half time 12:17.
const dir = path.join(import.meta.dirname, 'fixtures/team');
const files = {
  score: await fs.readFile(path.join(dir, 'score.html'), 'utf8'),
  game: await fs.readFile(path.join(dir, 'game.html'), 'utf8'),
  players: await fs.readFile(path.join(dir, 'players.html'), 'utf8'),
};

test('recognises the three exports', () => {
  assert.equal(detectFile(files.score), 'score');
  assert.equal(detectFile(files.game), 'game');
  assert.equal(detectFile(files.players), 'players');
  assert.equal(detectFile('<html><title>Was anderes</title></html>'), null);
});

test('classifies actions', () => {
  assert.deepEqual(classify('Tor Gegenstoß'), { kind: 'goal', zone: 'Gegenstoß' });
  assert.deepEqual(classify('Fehlwurf 9m'), { kind: 'miss', zone: '9m' });
  assert.deepEqual(classify('Gegentor Flügel'), { kind: 'conceded', zone: 'Flügel' });
  assert.deepEqual(classify('Parade 7m'), { kind: 'save', zone: '7m' });
  assert.equal(classify('Ballgewinn Erzwungen').kind, 'forcedSteal');
  assert.equal(classify('2 Minuten').kind, 'twoMin');
  assert.equal(classify('7m verursacht').kind, 'sevenCaused');
  assert.equal(classify('Irgendwas Neues').kind, 'other');
});

test('parses game, players and event log consistently', () => {
  const p = parseFiles(files);
  assert.equal(p.opponent, 'SG NTZ');
  assert.deepEqual([p.goalsFor, p.goalsAgainst, p.htFor, p.htAgainst], [25, 30, 12, 17]);
  assert.equal(p.events.length, 146);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.players.length, 16);
  const keeper = p.players.find((x) => x.keeper && x.no === '1')!;
  assert.deepEqual(keeper.keeper, { saves: 6, faced: 19, zones: keeper.keeper!.zones });
  // The player table must be reproducible from the event log, otherwise half filters lie.
  const totals = eventTotals(p.events);
  for (const pl of p.players) {
    const t = totals.get(pl.name) ?? {};
    assert.equal(pl.fouls, t.foul ?? 0, `${pl.name} Stopfouls`);
    assert.equal(pl.turnovers, t.turnover ?? 0, `${pl.name} Ballverluste`);
    assert.equal(pl.steals, t.steal ?? 0, `${pl.name} Ballgewinne`);
    assert.equal(pl.sevenWon, t.sevenWon ?? 0, `${pl.name} 7m geholt`);
  }
  assert.ok(p.players.every((x) => x.name === x.name.trim()), 'names are trimmed');
});

test('team and player aggregation, also by half', () => {
  const game = buildGame(files, { id: '1', date: '2026-10-31T19:00', opponent: 'SG NTZ', home: false }, 'now');
  const all = summarize(game, 0);
  assert.equal(all.for, 25);
  assert.equal(all.against, 30);
  assert.equal(all.team.shots, 43);
  assert.equal(all.team.saves, 12);
  assert.equal(all.team.faced, 42);
  const h1 = summarize(game, 1), h2 = summarize(game, 2);
  assert.equal(h1.for + h2.for, 25);
  assert.equal(h1.against + h2.against, 30);
  assert.equal(all.segments.reduce((a, s) => a + s.for, 0), 25);
  const list = players([game], 0, {});
  assert.equal(list.reduce((a, x) => a + x.line.goals, 0), 25);
  assert.equal(list.length, 16);
  // Aliases merge two spellings into one player.
  const second = buildGame(files, { id: '2', date: '2026-11-07T19:00', opponent: 'X', home: true }, 'now');
  const name = second.players[0].name;
  second.players[0] = { ...second.players[0], name: `${name}x` };
  second.events = second.events.map((e) => (e.name === name ? { ...e, name: `${name}x` } : e));
  const merged = players([game, second], 0, { [`${name}x`.toLowerCase()]: name });
  assert.equal(merged.find((x) => x.name === name)!.games, 2);
  assert.equal(merged.length, 16);
});

test('encryption round trip and wrong password', async () => {
  const salt = toB64(randomBytes(16));
  const key = await passwordKey('richtig', salt, 1000);
  const sealed = await seal(key, { a: 1, ü: 'ä' });
  assert.deepEqual(await open(key, sealed), { a: 1, ü: 'ä' });
  await assert.rejects(open(await passwordKey('falsch', salt, 1000), sealed), WrongKeyError);
});

test('matches the upload to the h4a game by score and opponent', async () => {
  const api: Record<string, unknown> = {
    index: { seasons: [{ id: 142, name: '2026/27' }] },
    's/142/meta': { teams: [{ id: 10, name: 'Spvgg Mössingen', leagueId: 1 }, { id: 20, name: 'SG Nürtingen-Zizishausen', leagueId: 1 }, { id: 30, name: 'TSF Ditzingen', leagueId: 1 }], leagues: [] },
    's/142/team/10': {
      league: { short: 'M-VL-2-BW' },
      games: [
        { id: 1, no: '1', leagueId: 1, date: '2026-09-19T20:30', homeId: 10, guestId: 30, home: 'Spvgg Mössing.', guest: 'TSF Ditzingen', homeGoals: 26, guestGoals: 23, status: 'finished' },
        { id: 2, no: '2', leagueId: 1, date: '2026-10-31T19:00', homeId: 20, guestId: 10, home: 'SG NTZ', guest: 'Spvgg Mössing.', homeGoals: 30, guestGoals: 25, status: 'finished' },
      ],
    },
  };
  const load = async <T,>(p: string) => api[p] as T;
  const list = await candidates(load, 'Spvgg Mössingen', { opponent: 'SG NTZ', goalsFor: 25, goalsAgainst: 30 });
  const best = bestCandidate(list)!;
  assert.equal(best.meta.id, '2');
  assert.equal(best.meta.home, false);
  assert.equal(best.meta.opponent, 'SG Nürtingen-Zizishausen');
});

test('store: upload payload → encrypted storage → bundle for the page', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'team-'));
  const secrets = { viewPassword: 'sehen', uploadPassword: 'hoch', storageKey: toB64(randomBytes(32)) };
  const store = new Store(tmp, secrets);
  const sealed = await seal(await passwordKey('hoch', config.uploadSalt), {
    action: 'upload', files, meta: { id: '9387681', date: '2026-10-31T19:00', opponent: 'SG Nürtingen-Zizishausen', home: false },
  });
  const log = await store.apply(await store.decryptPayload(sealed));
  assert.match(log, /^Spiel 9387681 gespeichert: 25:30/);
  assert.doesNotMatch(log, /Spieler [A-Z]/, 'log must not contain names');
  await store.build();
  const raw = await fs.readFile(path.join(tmp, 'bundle.enc'), 'utf8');
  assert.doesNotMatch(raw, /Spieler/);
  const bundle = await open<TeamBundle>(await passwordKey('sehen', config.viewSalt), raw);
  assert.equal(bundle.games.length, 1);
  assert.equal(bundle.games[0].goalsAgainst, 30);
  await assert.rejects(store.decryptPayload(await seal(await passwordKey('falsch', config.uploadSalt), { action: 'delete', id: 'x' })), WrongKeyError);
  await store.apply({ action: 'delete', id: '9387681' });
  assert.equal((await store.build()).games.length, 0);
  await assert.rejects(store.apply({ action: 'delete', id: '../evil' }), /Ungültige/);
  await fs.rm(tmp, { recursive: true });
});
