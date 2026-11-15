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

test('report: merged penalty clocks keep the third suspension and red card separate', async () => {
  const r = await parseReport(new Uint8Array(fs.readFileSync(fixture('penalties-synthetic.pdf'))), 9384291, 3537261, { home: 'Test Heim', guest: 'Test Gast' });
  const p = r.home.players.find((p) => p.name === 'Test Spieler')!;
  assert.deepEqual(p.twoMinutes, ['29:45', '36:03', '57:04']);
  assert.equal(p.disqualification, '57:04');
});

// Small valid PDF to exercise the report column and both published action wordings.
function blueCardPdf(action: string) {
  const text = (x: number, y: number, value: string) => `BT /F1 8 Tf ${x} ${y} Td (${value.replace(/[()\\]/g, '\\$&').replace(/[^\x20-\x7e]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0'))}) Tj ET`;
  const stream = [
    text(50, 780, 'Heim: Heim'),
    ...[[280, 'Tore'], [350, 'Verw.'], [390, '1.'], [418, '2.'], [446, '3.'], [474, 'Disq.'], [502, 'Ber.'], [530, 'Strafe']].map(([x, label]) => text(Number(x), 750, String(label))),
    text(50, 720, '7'), text(80, 720, 'Test Spieler'), text(466, 720, '20:00'), text(494, 720, '20:00'),
    text(50, 680, 'Spielverlauf'), text(50, 650, `12:00:00 20:00 ${action}`),
  ].join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}

for (const wording of ['Disqualifikation', 'Disqualifikation mit Bericht']) {
  test(`report: blue card from the report column and action '${wording}'`, async () => {
    const r = await parseReport(blueCardPdf(`${wording} für Test Spieler (7, Heim)`), 1, 1, { home: 'Heim', guest: 'Gast' });
    const p = r.home.players[0];
    assert.deepEqual(p.twoMinutes, []);
    assert.equal(p.disqualification, '20:00');
    assert.equal(p.disqualificationReport, '20:00');
    assert.equal(r.events[0].type, 'disqualification');
    assert.equal(r.events[0].side, 'home');
    assert.equal(r.events[0].disqualificationReport, true);
  });
}
