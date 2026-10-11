// The PDF parser against a real match report (HSC Radolfzell – Spvgg Mössingen 24:31,
// 10.10.2026). The same game is in the ticker fixtures, so the two parsers check each other.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { checkReport, parseReport } from '../pipeline/report.ts';
import { parseTicker } from '../web/src/lib/liveTicker.ts';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const final = { homeGoals: 24, guestGoals: 31 };

const report = await parseReport(new Uint8Array(fs.readFileSync(fixture('report-3524831.pdf'))), 9387596, 3524831, {
  home: 'HSC Radolfzell',
  guest: 'Spvgg Mössing.',
});

test('report: teams and result add up', () => {
  assert.equal(report.home.name, 'HSC Radolfzell');
  assert.equal(report.guest.name, 'Spvgg Mössingen');
  assert.deepEqual(checkReport(report, final), []);
  const last = report.events.at(-1)!;
  assert.deepEqual([last.homeScore, last.guestScore], [24, 31]);
});

test('report: every goal belongs to a listed player', () => {
  for (const side of ['home', 'guest'] as const) {
    const names = new Set(report[side].players.map((p) => p.name));
    for (const e of report.events) {
      if (e.side === side && (e.type === 'goal' || e.type === 'sevenGoal')) assert.ok(names.has(e.player!), `${e.player} is not on the ${side} sheet`);
    }
  }
});

test('report: a broken report is noticed', () => {
  const broken = structuredClone(report);
  broken.home.players[1].goals += 2;
  broken.events = broken.events.filter((e) => e.type !== 'sevenGoal');
  assert.ok(checkReport(broken, final).length >= 2);
});

test('report and ticker agree on who scored', () => {
  const ticker = parseTicker(JSON.parse(fs.readFileSync(fixture('ticker-messages.json'), 'utf8')), JSON.parse(fs.readFileSync(fixture('ticker-teams.json'), 'utf8')));
  for (const side of ['home', 'guest'] as const) {
    const goals = (players: { no: string; goals: number }[]) => Object.fromEntries(players.filter((p) => p.goals).map((p) => [p.no, p.goals]));
    assert.deepEqual(goals(ticker[side].players), goals(report[side].players));
  }
});
