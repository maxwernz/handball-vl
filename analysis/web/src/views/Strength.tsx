import { useMemo } from 'react';
import { rows } from '../db.ts';
import { DataTable, Plot, Section, Tiles, series } from '../components.tsx';
import { num, pct, signed } from '../format.ts';
import { gamesInScope } from '../scope.ts';
import { ScatterBox } from './ScatterBox.tsx';
import type { ViewProps } from './types.ts';

export function Strength({ f }: ViewProps) {
  const all = `${gamesInScope(f, false)} AND g.has_report = 1`;
  const scope = `${gamesInScope(f)} AND g.has_report = 1`;

  const rates = useMemo(() => rows<{ games: number; secs: number; goals: number; sh_secs: number; sh_goals_short: number; sh_goals_pp: number }>(`
    SELECT (SELECT COUNT(*) FROM (${scope})) AS games, (SELECT SUM(duration) FROM (${scope})) AS secs,
      (SELECT COUNT(*) FROM events WHERE type IN ('goal','sevenGoal') AND game_id IN (SELECT id FROM (${scope}))) AS goals,
      COALESCE(SUM(duration), 0) AS sh_secs, COALESCE(SUM(goals_for), 0) AS sh_goals_short, COALESCE(SUM(goals_against), 0) AS sh_goals_pp
    FROM strength_phases WHERE situation = 'shorthanded' AND game_id IN (SELECT id FROM (${scope}))`)[0], [scope]);

  const teams = useMemo(() => rows(`WITH g AS (${all}),
    sp AS (SELECT * FROM strength_phases WHERE game_id IN (SELECT id FROM g))
    SELECT t.id, t.name AS Team, l.short AS Liga, (SELECT COUNT(*) FROM team_games x WHERE x.team_id = t.id AND x.game_id IN (SELECT id FROM g)) AS Berichte,
      SUM(sp.situation = 'shorthanded') AS "UZ-Phasen", SUM(sp.situation = 'shorthanded' AND sp.players_difference = 2) AS "davon −2",
      SUM(CASE WHEN sp.situation = 'shorthanded' THEN sp.duration END) / 60.0 AS "UZ-Min",
      SUM(CASE WHEN sp.situation = 'shorthanded' THEN sp.goals_for END) AS "UZ T", SUM(CASE WHEN sp.situation = 'shorthanded' THEN sp.goals_against END) AS "UZ GT",
      SUM(CASE WHEN sp.situation = 'shorthanded' THEN sp.goals_for - sp.goals_against END) AS "UZ Diff",
      600.0 * SUM(CASE WHEN sp.situation = 'shorthanded' THEN sp.goals_for - sp.goals_against END) / SUM(CASE WHEN sp.situation = 'shorthanded' THEN sp.duration END) AS "UZ Diff/10 Min",
      AVG(CASE WHEN sp.situation = 'shorthanded' THEN sp.goals_for >= sp.goals_against END) AS "UZ überstanden %",
      SUM(sp.situation = 'powerplay') AS "ÜZ-Phasen", SUM(CASE WHEN sp.situation = 'powerplay' THEN sp.duration END) / 60.0 AS "ÜZ-Min",
      SUM(CASE WHEN sp.situation = 'powerplay' THEN sp.goals_for END) AS "ÜZ T", SUM(CASE WHEN sp.situation = 'powerplay' THEN sp.goals_against END) AS "ÜZ GT",
      SUM(CASE WHEN sp.situation = 'powerplay' THEN sp.goals_for - sp.goals_against END) AS "ÜZ Diff",
      600.0 * SUM(CASE WHEN sp.situation = 'powerplay' THEN sp.goals_for - sp.goals_against END) / SUM(CASE WHEN sp.situation = 'powerplay' THEN sp.duration END) AS "ÜZ Diff/10 Min",
      AVG(CASE WHEN sp.situation = 'powerplay' THEN sp.goals_for > sp.goals_against END) AS "ÜZ gewonnen %"
    FROM teams t JOIN leagues l ON l.id = t.league_id LEFT JOIN sp ON sp.team_id = t.id
    WHERE t.id IN (SELECT home_id FROM g UNION SELECT guest_id FROM g)
    GROUP BY t.id ORDER BY "UZ Diff" DESC`), [all]);

  const phases = useMemo(() => rows(`SELECT g.date AS Datum, t.name AS Team, o.name AS Gegner,
      CASE p.situation WHEN 'shorthanded' THEN 'Unterzahl' ELSE 'Überzahl' END AS Lage, p.players_difference AS Spieler,
      p.start_clock AS Von, p.end_clock AS Bis, p.duration AS Sek, p.score_for_start || ':' || p.score_against_start AS "Stand Beginn",
      p.goals_for AS T, p.goals_against AS GT, p.goals_for - p.goals_against AS Diff, p.penalized AS Bestraft, g.game_no AS Spielnr
    FROM strength_phases p JOIN games g ON g.id = p.game_id JOIN teams t ON t.id = p.team_id JOIN teams o ON o.id = p.opponent_id
    WHERE p.game_id IN (SELECT id FROM (${scope})) ${f.team ? `AND p.team_id = ${f.team}` : "AND p.situation = 'shorthanded'"}
    ORDER BY g.kickoff, p.start_t`), [scope, f.team]);

  if (!rates.games) return <p>Keine Spiele mit Spielbericht für diese Auswahl.</p>;
  const evenSecs = rates.secs - rates.sh_secs;
  const evenGoals = rates.goals - rates.sh_goals_short - rates.sh_goals_pp;
  const per60 = (goals: number, secs: number) => (goals / secs) * 3600;
  const outcomes = phases.filter((p) => p.Lage === 'Unterzahl').map((p) => p.Diff as number);
  const pctKeys = new Set(['UZ überstanden %', 'ÜZ gewonnen %']);

  return (
    <>
      <Tiles items={[
        { label: 'Tore/60 Min je Team, Gleichzahl', value: num(per60(evenGoals, evenSecs * 2), 2), sub: `${num(evenSecs / 60 / rates.games, 1)} Min pro Spiel` },
        { label: 'Tore/60 Min Überzahl-Team', value: num(per60(rates.sh_goals_pp, rates.sh_secs), 2) },
        { label: 'Tore/60 Min Unterzahl-Team', value: num(per60(rates.sh_goals_short, rates.sh_secs), 2) },
        { label: 'Ungleiche Spielerzahl', value: `${num(rates.sh_secs / 60 / rates.games, 1)} Min`, sub: `pro Spiel (${pct(rates.sh_secs / rates.secs)} der Spielzeit)` },
        { label: 'Ø Diff pro Unterzahl-Phase', value: signed(outcomes.reduce((a, b) => a + b, 0) / outcomes.length), sub: `${outcomes.length} Phasen${f.team ? ' des Teams' : ''}` },
      ]} />
      <Section title="Über-/Unterzahl je Team" note="Phasen aus den Strafen rekonstruiert (2 Min und Rot = 2 Min weniger auf dem Feld). „überstanden“ = Unterzahl ohne negative Tordifferenz.">
        <DataTable name="unterzahl-teams" rows={teams} columns={Object.keys(teams[0] ?? {}).filter((k) => k !== 'id').map((key) => ({ key, format: pctKeys.has(key) ? (v: unknown) => pct(v as number, 0) : undefined }))} limit={200} maxHeight={560} />
      </Section>
      <div className="grid2">
        <Section title="Ergebnis der Unterzahl-Phasen" note="Tore minus Gegentore des Teams in Unterzahl, je Phase.">
          <Plot data={[{ type: 'histogram', x: outcomes, xbins: { size: 1 }, marker: { color: series(1) }, hovertemplate: 'Diff %{x}: %{y} Phasen<extra></extra>' }]}
            layout={{ xaxis: { title: { text: 'Tordifferenz in der Phase' }, dtick: 1 }, yaxis: { title: { text: 'Phasen' } } }} />
        </Section>
        <ScatterBox title="Unterzahl vs. Überzahl" rows={teams} label="Team" x="ÜZ Diff/10 Min" y="UZ Diff/10 Min" highlight={f.team ? (r) => r.id === f.team : undefined} />
      </div>
      <Section title={f.team ? 'Alle Phasen des Teams' : 'Alle Unterzahl-Phasen'} note="Spielnr = Nummer im Phönix-Videoportal.">
        <DataTable name="phasen" rows={phases} limit={100} maxHeight={500} />
      </Section>
    </>
  );
}
