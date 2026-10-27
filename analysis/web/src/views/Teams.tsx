import { useMemo } from 'react';
import { rows } from '../db.ts';
import { DataTable, Section } from '../components.tsx';
import { pct } from '../format.ts';
import { gamesInScope } from '../scope.ts';
import { ScatterBox } from './ScatterBox.tsx';
import type { ViewProps } from './types.ts';

export const teamTableSql = (scope: string) => `WITH g AS (${scope}),
  tg AS (SELECT tg.*, CASE tg.result WHEN 'S' THEN 2 WHEN 'U' THEN 1 ELSE 0 END AS pts FROM team_games tg WHERE tg.game_id IN (SELECT id FROM g)),
  ev AS (SELECT te.team_id,
      SUM(te.type = 'sevenGoal' AND te.by_team = 1) AS s7g, SUM(te.type IN ('sevenGoal','sevenMiss') AND te.by_team = 1) AS s7a,
      SUM(te.type = 'sevenGoal' AND te.by_team = 0) AS o7g, SUM(te.type IN ('sevenGoal','sevenMiss') AND te.by_team = 0) AS o7a,
      SUM(te.type IN ('twoMinutes','disqualification') AND te.by_team = 1) AS pen, SUM(te.type IN ('twoMinutes','disqualification') AND te.by_team = 0) AS opp_pen,
      SUM(te.type = 'warning' AND te.by_team = 1) AS warn, SUM(te.type = 'disqualification' AND te.by_team = 1) AS red,
      SUM(te.type = 'timeout' AND te.by_team = 1) AS timeouts,
      SUM(te.type IN ('goal','sevenGoal') AND te.by_team = 1 AND te.t >= 3000) AS last10_for, SUM(te.type IN ('goal','sevenGoal') AND te.by_team = 0 AND te.t >= 3000) AS last10_against,
      SUM(te.type IN ('goal','sevenGoal') AND te.by_team = 1 AND te.strength = 'even') AS even_for, SUM(te.type IN ('goal','sevenGoal') AND te.by_team = 0 AND te.strength = 'even') AS even_against
    FROM team_events te WHERE te.game_id IN (SELECT id FROM g WHERE has_report = 1) GROUP BY te.team_id),
  sp AS (SELECT p.team_id,
      SUM(CASE WHEN p.situation = 'shorthanded' THEN p.duration END) / 60.0 AS uz_min,
      SUM(CASE WHEN p.situation = 'shorthanded' THEN p.goals_for END) AS uz_for, SUM(CASE WHEN p.situation = 'shorthanded' THEN p.goals_against END) AS uz_against,
      SUM(CASE WHEN p.situation = 'powerplay' THEN p.duration END) / 60.0 AS pp_min,
      SUM(CASE WHEN p.situation = 'powerplay' THEN p.goals_for END) AS pp_for, SUM(CASE WHEN p.situation = 'powerplay' THEN p.goals_against END) AS pp_against
    FROM strength_phases p WHERE p.game_id IN (SELECT id FROM g) GROUP BY p.team_id)
SELECT tg.team_id AS id, t.name AS Team, l.short AS Liga, COUNT(*) AS Sp, SUM(tg.result = 'S') AS S, SUM(tg.result = 'U') AS U, SUM(tg.result = 'N') AS N,
  SUM(tg.pts) AS Pkt, AVG(tg.pts) AS "Pkt/Sp",
  AVG(tg.goals_for) AS "T/Sp", AVG(tg.goals_against) AS "GT/Sp", AVG(tg.goals_for - tg.goals_against) AS "Diff/Sp",
  sqrt((AVG((tg.goals_for - tg.goals_against) * (tg.goals_for - tg.goals_against)) - AVG(tg.goals_for - tg.goals_against) * AVG(tg.goals_for - tg.goals_against)) * COUNT(*) / NULLIF(COUNT(*) - 1.0, 0)) AS "SD Diff",
  AVG(tg.ht_for - tg.ht_against) AS "Diff 1.HZ", AVG((tg.goals_for - tg.ht_for) - (tg.goals_against - tg.ht_against)) AS "Diff 2.HZ",
  AVG(CASE WHEN tg.is_home = 1 THEN tg.pts END) AS "Pkt/Sp heim", AVG(CASE WHEN tg.is_home = 0 THEN tg.pts END) AS "Pkt/Sp ausw.",
  SUM(ABS(tg.goals_for - tg.goals_against) <= 2) AS "Knappe Sp", AVG(CASE WHEN ABS(tg.goals_for - tg.goals_against) <= 2 THEN tg.pts END) AS "Pkt/Sp knapp",
  SUM(tg.has_report) AS Berichte,
  1.0 * ev.last10_for / SUM(tg.has_report) AS "T/Sp 51.–60.", 1.0 * ev.last10_against / SUM(tg.has_report) AS "GT/Sp 51.–60.",
  1.0 * ev.s7a / SUM(tg.has_report) AS "7m/Sp", 1.0 * ev.s7g / NULLIF(ev.s7a, 0) AS "7m %", 1.0 * ev.o7a / SUM(tg.has_report) AS "Geg. 7m/Sp", 1.0 * ev.o7g / NULLIF(ev.o7a, 0) AS "Geg. 7m %",
  1.0 * ev.pen / SUM(tg.has_report) AS "Strafen/Sp", 1.0 * ev.opp_pen / SUM(tg.has_report) AS "Geg. Strafen/Sp", 1.0 * ev.warn / SUM(tg.has_report) AS "Gelb/Sp", ev.red AS Rot,
  1.0 * ev.timeouts / SUM(tg.has_report) AS "Auszeiten/Sp",
  1.0 * (ev.even_for - ev.even_against) / SUM(tg.has_report) AS "Diff/Sp Gleichzahl",
  sp.uz_min / SUM(tg.has_report) AS "UZ-Min/Sp", sp.uz_for AS "UZ T", sp.uz_against AS "UZ GT", sp.uz_for - sp.uz_against AS "UZ Diff",
  10.0 * (sp.uz_for - sp.uz_against) / NULLIF(sp.uz_min, 0) AS "UZ Diff/10 Min",
  sp.pp_min / SUM(tg.has_report) AS "ÜZ-Min/Sp", sp.pp_for AS "ÜZ T", sp.pp_against AS "ÜZ GT", sp.pp_for - sp.pp_against AS "ÜZ Diff",
  10.0 * (sp.pp_for - sp.pp_against) / NULLIF(sp.pp_min, 0) AS "ÜZ Diff/10 Min"
FROM tg JOIN teams t ON t.id = tg.team_id JOIN leagues l ON l.id = t.league_id
  LEFT JOIN ev ON ev.team_id = tg.team_id LEFT JOIN sp ON sp.team_id = tg.team_id
GROUP BY tg.team_id ORDER BY "Pkt/Sp" DESC, "Diff/Sp" DESC`;

export const TEAM_NOTES: Record<string, string> = {
  'Pkt/Sp': 'Punkte pro Spiel (Sieg 2, Remis 1)',
  'SD Diff': 'Standardabweichung der Tordifferenz – Konstanz',
  'Knappe Sp': 'Spiele mit höchstens 2 Toren Unterschied',
  'T/Sp 51.–60.': 'Tore in den letzten 10 Minuten pro Spiel mit Bericht',
  'Diff/Sp Gleichzahl': 'Tordifferenz pro Spiel nur bei gleicher Spielerzahl',
  'UZ-Min/Sp': 'Minuten in Unterzahl pro Spiel',
  'UZ Diff/10 Min': 'Tordifferenz pro 10 Minuten Unterzahl',
  'ÜZ Diff/10 Min': 'Tordifferenz pro 10 Minuten Überzahl',
  Berichte: 'Spiele mit Spielbericht – Basis aller Ereignis-Werte',
};
const PCT = new Set(['7m %', 'Geg. 7m %']);

export function Teams({ f }: ViewProps) {
  const data = useMemo(() => rows(teamTableSql(gamesInScope(f, false))), [f]);
  if (!data.length) return <p>Keine Daten.</p>;
  const columns = Object.keys(data[0]).filter((k) => k !== 'id').map((key) => ({ key, title: TEAM_NOTES[key], format: PCT.has(key) ? (v: unknown) => pct(v as number) : undefined }));
  return (
    <>
      <Section title="Teamwerte" note="Alle Werte pro Spiel, sofern nicht anders angegeben. Ereigniswerte (7m, Strafen, Über-/Unterzahl, Schlussphase) nur aus Spielen mit Spielbericht. Spaltenkopf klicken zum Sortieren, Spalten mit ? haben eine Erklärung.">
        <DataTable name="teams" rows={data} columns={columns} limit={200} maxHeight={600} />
      </Section>
      <ScatterBox title="Zusammenhang zweier Teamwerte" rows={data} label="Team" x="Diff/Sp" y="Pkt/Sp" highlight={f.team ? (r) => r.id === f.team : undefined}
        note="Jeder Punkt ist ein Team. Gestrichelt: lineare Regression (kleinste Quadrate). p-Wert für H₀: kein linearer Zusammenhang." />
    </>
  );
}
