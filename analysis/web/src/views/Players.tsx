import { useMemo, useState } from 'react';
import { rows } from '../db.ts';
import { DataTable, Plot, Section, Select, series } from '../components.tsx';
import { pct } from '../format.ts';
import { gamesInScope } from '../scope.ts';
import type { ViewProps } from './types.ts';

export function Players({ f }: ViewProps) {
  const [minGames, setMinGames] = useState(3);
  const scope = `${gamesInScope(f)} AND g.has_report = 1`;
  const team = f.team ? `AND p.team_id = ${f.team}` : '';

  const players = useMemo(() => rows(`WITH g AS (${scope}),
    p AS (SELECT * FROM players p WHERE p.is_official = 0 AND p.game_id IN (SELECT id FROM g) ${team}),
    tg AS (SELECT team_id, SUM(goals) AS goals FROM players WHERE is_official = 0 AND game_id IN (SELECT id FROM g) GROUP BY team_id)
    SELECT p.player_key AS key, MAX(p.name) AS Spieler, t.name AS Team, l.short AS Liga, COUNT(*) AS Sp, SUM(p.goals) AS Tore, AVG(p.goals) AS "T/Sp",
      sqrt((AVG(p.goals * p.goals) - AVG(p.goals) * AVG(p.goals)) * COUNT(*) / NULLIF(COUNT(*) - 1.0, 0)) AS "SD T", MAX(p.goals) AS Max,
      SUM(p.field_goals) AS Feldtore, AVG(p.field_goals) AS "Feld/Sp", SUM(p.seven_goals) AS "7m T", SUM(p.seven_attempts) AS "7m V",
      1.0 * SUM(p.seven_goals) / NULLIF(SUM(p.seven_attempts), 0) AS "7m %", 1.0 * SUM(p.goals) / NULLIF(tg.goals, 0) AS "Anteil Teamtore",
      SUM(p.goals > 0) AS "Sp mit Tor", SUM(p.two_minutes) AS "2 Min", AVG(p.two_minutes) AS "2 Min/Sp", SUM(p.warning_clock IS NOT NULL) AS Gelb, SUM(p.disqualification_clock IS NOT NULL) AS Rot
    FROM p JOIN teams t ON t.id = p.team_id JOIN leagues l ON l.id = t.league_id LEFT JOIN tg ON tg.team_id = p.team_id
    GROUP BY p.player_key HAVING COUNT(*) >= ${minGames} ORDER BY Tore DESC`), [scope, team, minGames]);

  // Goals per game of the team's top scorers, to show consistency.
  const perGame = useMemo(() => (f.team ? rows<{ name: string; goals: number }>(`SELECT p.name, p.goals FROM players p
      WHERE p.is_official = 0 AND p.team_id = ${f.team} AND p.game_id IN (SELECT id FROM (${scope}))
        AND p.player_key IN (SELECT player_key FROM players WHERE team_id = ${f.team} AND is_official = 0 GROUP BY player_key ORDER BY SUM(goals) DESC LIMIT 15)`) : []), [scope, f.team]);

  const order = useMemo(() => {
    const sums = new Map<string, number[]>();
    for (const r of perGame) (sums.get(r.name) ?? sums.set(r.name, []).get(r.name)!).push(r.goals);
    return [...sums].sort((a, b) => b[1].reduce((x, y) => x + y, 0) / b[1].length - a[1].reduce((x, y) => x + y, 0) / a[1].length).map(([name]) => name);
  }, [perGame]);
  const pctKeys = new Set(['7m %', 'Anteil Teamtore']);
  return (
    <>
      <Section title="Spielerwerte" note="Sp = Spiele im Spielbericht (Kader, nicht zwingend eingesetzt). Nur Spiele mit Spielbericht. Feldtore = Tore ohne 7m."
        actions={<Select label="mind. Spiele" value={minGames} options={[1, 3, 5, 8, 10].map((n) => ({ value: n, label: String(n) }))} onChange={setMinGames} />}>
        <DataTable name="spieler" rows={players} limit={200} maxHeight={600}
          columns={Object.keys(players[0] ?? {}).filter((k) => k !== 'key').map((key) => ({ key, format: pctKeys.has(key) ? (v: unknown) => pct(v as number) : undefined }))} />
      </Section>
      <div className="grid2">
        <Section title="Verteilung: Tore pro Spiel" note={`Spieler mit mindestens ${minGames} Spielen.`}>
          <Plot data={[{ type: 'histogram', x: players.map((p) => p['T/Sp'] as number), xbins: { size: 0.5 }, marker: { color: series(0) }, hovertemplate: '%{x} T/Sp: %{y} Spieler<extra></extra>' }]}
            layout={{ xaxis: { title: { text: 'Tore pro Spiel' } }, yaxis: { title: { text: 'Spieler' } } }} />
        </Section>
        <Section title="7m-Schützen" note="Versuche gegen Quote, ab 5 Versuchen.">
          <Plot data={[{ type: 'scatter', mode: 'markers', x: players.filter((p) => (p['7m V'] as number) >= 5).map((p) => p['7m V'] as number),
            y: players.filter((p) => (p['7m V'] as number) >= 5).map((p) => p['7m %'] as number),
            text: players.filter((p) => (p['7m V'] as number) >= 5).map((p) => `${p.Spieler} (${p.Team})`),
            marker: { color: series(0), size: 9, line: { width: 1, color: 'rgba(255,255,255,0.8)' } },
            hovertemplate: '%{text}<br>%{x} Versuche, %{y:.0%}<extra></extra>' }]}
            layout={{ xaxis: { title: { text: '7m-Versuche' } }, yaxis: { title: { text: 'Quote' }, tickformat: '.0%' } }} />
        </Section>
      </div>
      {f.team ? (
        <Section title="Tore pro Spiel der besten Torschützen" note="Sortiert nach Mittelwert. Box: Quartile, durchgezogen: Median, gestrichelt: Mittelwert. Zeigt, wie konstant ein Spieler trifft.">
          <Plot height={460} data={[{ type: 'box', x: perGame.map((r) => r.name), y: perGame.map((r) => r.goals), boxmean: true, boxpoints: 'all', jitter: 0.4, pointpos: 0,
            marker: { color: series(0), size: 5 }, hoverinfo: 'y' }]} layout={{ showlegend: false, yaxis: { title: { text: 'Tore' } }, xaxis: { tickangle: -35, categoryorder: 'array', categoryarray: order } }} />
        </Section>
      ) : null}
    </>
  );
}
