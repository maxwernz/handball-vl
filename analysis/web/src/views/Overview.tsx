import { useMemo } from 'react';
import { rows } from '../db.ts';
import { DataTable, Plot, Section, Tiles, series } from '../components.tsx';
import { num, pct, signed } from '../format.ts';
import { ci95, describe, wilson } from '../stats.ts';
import { gamesInScope } from '../scope.ts';
import type { ViewProps } from './types.ts';

interface G { id: number; league: string; round: number; date: string; hg: number; gg: number; hht: number | null; ght: number | null;
  has_report: number; spectators: number | null; pen: number | null; seven: number | null; seven_goals: number | null }

export function Overview({ f }: ViewProps) {
  const games = useMemo(() => rows<G>(`WITH g AS (${gamesInScope(f)})
    SELECT g.id, l.short AS league, g.round, g.date, g.home_goals AS hg, g.guest_goals AS gg, g.home_goals_ht AS hht, g.guest_goals_ht AS ght,
      g.has_report, g.spectators,
      CASE WHEN g.has_report THEN (SELECT COUNT(*) FROM events e WHERE e.game_id = g.id AND e.type IN ('twoMinutes','disqualification')) END AS pen,
      CASE WHEN g.has_report THEN (SELECT COUNT(*) FROM events e WHERE e.game_id = g.id AND e.type IN ('sevenGoal','sevenMiss')) END AS seven,
      CASE WHEN g.has_report THEN (SELECT COUNT(*) FROM events e WHERE e.game_id = g.id AND e.type = 'sevenGoal') END AS seven_goals
    FROM g JOIN leagues l ON l.id = g.league_id`), [f]);

  const s = useMemo(() => {
    const total = games.map((g) => g.hg + g.gg);
    const margin = games.map((g) => g.hg - g.gg);
    const rep = games.filter((g) => g.has_report);
    const n = games.length;
    const home = games.filter((g) => g.hg > g.gg).length;
    const draw = games.filter((g) => g.hg === g.gg).length;
    const seven = rep.reduce((a, g) => a + (g.seven ?? 0), 0);
    const sevenGoals = rep.reduce((a, g) => a + (g.seven_goals ?? 0), 0);
    const htGames = games.filter((g) => g.hht !== null && g.ght !== null);
    return { total, margin, rep, n, home, draw, seven, sevenGoals, htGames, d: describe(total), m: describe(margin) };
  }, [games]);

  // Half-time result → final result
  const htMatrix = useMemo(() => {
    const cat = (d: number) => (d > 0 ? 'Führung' : d < 0 ? 'Rückstand' : 'Gleichstand');
    const out: Record<string, { n: number; S: number; U: number; N: number }> = {};
    for (const g of s.htGames) {
      // From the home team's view and the guest's view: every game counts twice, symmetric.
      for (const [ht, ft] of [[g.hht! - g.ght!, g.hg - g.gg], [g.ght! - g.hht!, g.gg - g.hg]]) {
        const k = cat(ht);
        out[k] ??= { n: 0, S: 0, U: 0, N: 0 };
        out[k].n++;
        out[k][ft > 0 ? 'S' : ft < 0 ? 'N' : 'U']++;
      }
    }
    const byLead = new Map<number, { n: number; S: number; U: number; N: number }>();
    for (const g of s.htGames) {
      const d = Math.abs(g.hht! - g.ght!);
      if (!d) continue;
      const lead = Math.min(d, 6);
      const leaderWon = Math.sign(g.hht! - g.ght!) === Math.sign(g.hg - g.gg) ? 'S' : g.hg === g.gg ? 'U' : 'N';
      const e = byLead.get(lead) ?? { n: 0, S: 0, U: 0, N: 0 };
      e.n++; e[leaderWon]++;
      byLead.set(lead, e);
    }
    return {
      rows: ['Führung', 'Gleichstand', 'Rückstand'].filter((k) => out[k]).map((k) => ({ Halbzeit: k, Fälle: out[k].n, Sieg: out[k].S / out[k].n, Remis: out[k].U / out[k].n, Niederlage: out[k].N / out[k].n })),
      lead: [...byLead].sort((a, b) => a[0] - b[0]).map(([lead, e]) => {
        const [lo, hi] = wilson(e.S, e.n);
        return { 'HZ-Führung': lead === 6 ? '6+' : String(lead), Spiele: e.n, 'Sieg %': e.S / e.n, 'Remis %': e.U / e.n, 'Niederlage %': e.N / e.n, 'Sieg KI unten': lo, 'Sieg KI oben': hi };
      }),
    };
  }, [s.htGames]);

  const byLeague = useMemo(() => rows(`WITH g AS (${gamesInScope(f)}),
    ev AS (SELECT e.game_id, SUM(e.type IN ('twoMinutes','disqualification')) AS pen, SUM(e.type IN ('sevenGoal','sevenMiss')) AS seven,
             SUM(e.type = 'sevenGoal') AS seven_goals, SUM(e.type = 'timeout') AS timeouts FROM events e WHERE e.game_id IN (SELECT id FROM g) GROUP BY e.game_id)
    SELECT l.short AS Liga, COUNT(*) AS Spiele, SUM(g.has_report) AS Berichte,
      AVG(g.home_goals + g.guest_goals) AS "Tore/Spiel",
      sqrt((AVG((g.home_goals + g.guest_goals) * (g.home_goals + g.guest_goals)) - AVG(g.home_goals + g.guest_goals) * AVG(g.home_goals + g.guest_goals)) * COUNT(*) / NULLIF(COUNT(*) - 1.0, 0)) AS "SD Tore",
      AVG(g.home_goals > g.guest_goals) AS "Heimsieg %", AVG(g.home_goals = g.guest_goals) AS "Remis %",
      AVG(g.home_goals - g.guest_goals) AS "Ø Heim-Diff", AVG(ABS(g.home_goals - g.guest_goals)) AS "Ø |Diff|",
      AVG(ABS(g.home_goals - g.guest_goals) <= 2) AS "Knapp ≤2 %",
      AVG(ev.pen) AS "Strafen/Spiel", AVG(ev.seven) AS "7m/Spiel", 1.0 * SUM(ev.seven_goals) / NULLIF(SUM(ev.seven), 0) AS "7m-Quote",
      AVG(ev.timeouts) AS "Auszeiten/Spiel", AVG(g.spectators) AS "Zuschauer Ø"
    FROM g JOIN leagues l ON l.id = g.league_id LEFT JOIN ev ON ev.game_id = g.id
    GROUP BY l.id ORDER BY l.gender DESC, l.level_rank, l.staffel`), [f]);

  const byRound = useMemo(() => rows<{ league: string; round: number; goals: number; n: number }>(`WITH g AS (${gamesInScope(f)})
    SELECT g.round, AVG(g.home_goals + g.guest_goals) AS goals, COUNT(*) AS n FROM g GROUP BY g.round ORDER BY g.round`), [f]);

  if (!games.length) return <p>Keine beendeten Spiele für diese Auswahl.</p>;
  const [mlo, mhi] = ci95(s.margin);
  const [hlo, hhi] = wilson(s.home, s.n);
  const pctCols = new Set(['Heimsieg %', 'Remis %', 'Knapp ≤2 %', '7m-Quote']);

  return (
    <>
      <Tiles items={[
        { label: 'Spiele (beendet)', value: num(s.n), sub: `${s.rep.length} mit Spielbericht (${pct(s.rep.length / s.n, 0)})` },
        { label: 'Tore pro Spiel', value: num(s.d.mean, 2), sub: `SD ${num(s.d.sd, 2)} · Median ${num(s.d.median, 1)} · ${s.d.min}–${s.d.max}` },
        { label: 'Heimsiege', value: pct(s.home / s.n), sub: `95 %-KI ${pct(hlo, 0)}–${pct(hhi, 0)} · Remis ${pct(s.draw / s.n)}`, title: 'Wilson-Intervall' },
        { label: 'Heimvorteil (Tore)', value: signed(s.m.mean), sub: `95 %-KI ${signed(mlo)} bis ${signed(mhi)}`, title: 'Mittlere Tordifferenz Heim − Gast' },
        { label: 'Strafen pro Spiel', value: num(s.rep.reduce((a, g) => a + (g.pen ?? 0), 0) / s.rep.length, 2), sub: 'beide Teams, 2 Min + Rot' },
        { label: '7m pro Spiel', value: num(s.seven / s.rep.length, 2), sub: `Quote ${pct(s.sevenGoals / s.seven)}` },
      ]} />

      <div className="grid2">
        <Section title="Verteilung: Tore pro Spiel" note="Summe beider Teams. Gestrichelt: Mittelwert.">
          <Plot data={[{ type: 'histogram', x: s.total, xbins: { size: 1 }, marker: { color: series(0) }, hovertemplate: '%{x} Tore: %{y} Spiele<extra></extra>' }]}
            layout={{ xaxis: { title: { text: 'Tore' } }, yaxis: { title: { text: 'Spiele' } }, shapes: [{ type: 'line', x0: s.d.mean, x1: s.d.mean, yref: 'paper', y0: 0, y1: 1, line: { dash: 'dash', width: 1.5 } }] }} />
        </Section>
        <Section title="Verteilung: Tordifferenz Heim − Gast" note="Rechts von 0 gewinnt das Heimteam.">
          <Plot data={[{ type: 'histogram', x: s.margin, xbins: { size: 1 }, marker: { color: series(1) }, hovertemplate: 'Differenz %{x}: %{y} Spiele<extra></extra>' }]}
            layout={{ xaxis: { title: { text: 'Heim − Gast' }, zeroline: true }, yaxis: { title: { text: 'Spiele' } } }} />
        </Section>
      </div>

      <Section title="Ligen im Vergleich" note="Strafen, 7m und Auszeiten nur aus Spielen mit Spielbericht. SD = Standardabweichung.">
        <DataTable name="ligen" rows={byLeague} columns={Object.keys(byLeague[0] ?? {}).map((key) => ({ key, format: pctCols.has(key) ? (v) => pct(v as number) : undefined }))} />
      </Section>

      <div className="grid2">
        <Section title="Tore pro Spiel je Liga" note="Box: Quartile, Strich: Median, Punkte: Ausreißer.">
          <Plot height={Math.max(300, byLeague.length * 26 + 80)} data={[{ type: 'box', orientation: 'h', y: games.map((g) => g.league), x: games.map((g) => g.hg + g.gg),
            marker: { color: series(0), size: 4 }, boxmean: true, hoverinfo: 'x' }]}
            layout={{ xaxis: { title: { text: 'Tore pro Spiel' } }, yaxis: { autorange: 'reversed', type: 'category' }, showlegend: false, margin: { l: 110, r: 16, t: 20, b: 40 } }} />
        </Section>
        <Section title="Tore pro Spiel nach Spieltag">
          <Plot data={[{ type: 'scatter', mode: 'lines+markers', x: byRound.map((r) => r.round), y: byRound.map((r) => r.goals), customdata: byRound.map((r) => r.n),
            line: { width: 2, color: series(0) }, marker: { size: 8 }, hovertemplate: 'Spieltag %{x}: %{y:.2f} Tore (%{customdata} Spiele)<extra></extra>' }]}
            layout={{ xaxis: { title: { text: 'Spieltag' }, dtick: 1 }, yaxis: { title: { text: 'Ø Tore' } } }} />
        </Section>
      </div>

      <div className="grid2">
        <Section title="Halbzeitstand → Endergebnis" note="Jedes Spiel aus Sicht beider Teams.">
          <DataTable name="halbzeit-endergebnis" rows={htMatrix.rows} columns={[{ key: 'Halbzeit' }, { key: 'Fälle' },
            ...['Sieg', 'Remis', 'Niederlage'].map((key) => ({ key, format: (v: unknown) => pct(v as number) }))]} />
        </Section>
        <Section title="Wie sicher ist eine Halbzeitführung?" note="Ausgang für das zur Pause führende Team, mit 95 %-Wilson-Intervall für die Siegquote.">
          <DataTable name="hz-fuehrung" rows={htMatrix.lead} columns={Object.keys(htMatrix.lead[0] ?? {}).map((key) => ({ key, format: key.includes('%') || key.includes('KI') ? (v) => pct(v as number, 0) : undefined }))} />
        </Section>
      </div>
    </>
  );
}
