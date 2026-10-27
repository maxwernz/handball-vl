import { useMemo, useState } from 'react';
import { rows } from '../db.ts';
import { DataTable, Plot, Section, Select, Tiles, series } from '../components.tsx';
import { num, signed } from '../format.ts';
import { ci95, mean, pFromT, sd } from '../stats.ts';
import { gamesInScope } from '../scope.ts';
import type { ViewProps } from './types.ts';

const BUCKETS = ['1–5', '6–10', '11–15', '16–20', '21–25', '26–30', '31–35', '36–40', '41–45', '46–50', '51–55', '56–60', 'Verl.'];
const METRICS = {
  goals: ['Tore', "type IN ('goal','sevenGoal')"],
  seven: ['7m (Tor + Fehlwurf)', "type IN ('sevenGoal','sevenMiss')"],
  pen: ['Strafen (2 Min + Rot)', "type IN ('twoMinutes','disqualification')"],
  warn: ['Verwarnungen', "type = 'warning'"],
  timeout: ['Auszeiten', "type = 'timeout'"],
} as const;
type Metric = keyof typeof METRICS;

export function Timeline({ f }: ViewProps) {
  const [metric, setMetric] = useState<Metric>('goals');
  const [span, setSpan] = useState(180);
  const scope = `${gamesInScope(f)} AND g.has_report = 1`;
  const nGames = useMemo(() => rows<{ n: number }>(`SELECT COUNT(*) AS n FROM (${scope})`)[0].n, [scope]);

  const buckets = useMemo(() => {
    const cond = METRICS[metric][1];
    const sql = f.team
      ? `SELECT MIN(t / 300, 12) AS b, SUM(by_team = 1) AS own, SUM(by_team = 0) AS opp FROM team_events
         WHERE team_id = ${f.team} AND game_id IN (SELECT id FROM (${scope})) AND ${cond} GROUP BY b`
      : `SELECT MIN(t / 300, 12) AS b, COUNT(*) AS own, 0 AS opp FROM events WHERE game_id IN (SELECT id FROM (${scope})) AND ${cond} GROUP BY b`;
    const got = new Map(rows<{ b: number; own: number; opp: number }>(sql).map((r) => [r.b, r]));
    return BUCKETS.map((label, b) => ({ Minuten: label, [f.team ? 'Team' : 'Gesamt']: (got.get(b)?.own ?? 0) / nGames, ...(f.team ? { Gegner: (got.get(b)?.opp ?? 0) / nGames } : {}), Anzahl: (got.get(b)?.own ?? 0) + (got.get(b)?.opp ?? 0) }));
  }, [scope, metric, f.team, nGames]);

  // Score difference after every minute, from the selected team's (or the home team's) view.
  const curve = useMemo(() => {
    const goals = rows<{ game_id: number; t: number; d: number }>(f.team
      ? `SELECT game_id, t, score_for - score_against AS d FROM team_events WHERE team_id = ${f.team} AND type IN ('goal','sevenGoal') AND game_id IN (SELECT id FROM (${scope})) ORDER BY game_id, seq`
      : `SELECT game_id, t, home_score - guest_score AS d FROM events WHERE type IN ('goal','sevenGoal') AND game_id IN (SELECT id FROM (${scope})) ORDER BY game_id, seq`);
    const byGame = new Map<number, { t: number; d: number }[]>();
    for (const g of goals) (byGame.get(g.game_id) ?? byGame.set(g.game_id, []).get(g.game_id)!).push(g);
    const perMinute: number[][] = Array.from({ length: 61 }, () => []);
    for (const list of byGame.values()) {
      let i = 0, d = 0;
      for (let m = 0; m <= 60; m++) {
        while (i < list.length && list[i].t <= m * 60) d = list[i++].d;
        perMinute[m].push(f.team ? d : Math.abs(d));
      }
    }
    return perMinute.map((v, m) => ({ m, mean: mean(v), sd: sd(v), n: v.length }));
  }, [scope, f.team]);

  const timeouts = useMemo(() => rows<{ team: string; game_id: number; clock: string; lead: number; bf: number; ba: number; af: number; aa: number }>(`
    WITH tos AS (SELECT e.game_id, e.seq, e.t, e.clock, e.team_id, e.home_lead_before, e.side FROM events e
      WHERE e.type = 'timeout' AND e.team_id IS NOT NULL AND e.t >= ${span} AND e.t <= ${3600 - span}
        AND e.game_id IN (SELECT id FROM (${scope})) ${f.team ? `AND e.team_id = ${f.team}` : ''})
    SELECT t.name AS team, x.game_id, x.clock, CASE x.side WHEN 'home' THEN x.home_lead_before ELSE -x.home_lead_before END AS lead,
      (SELECT COUNT(*) FROM events e WHERE e.game_id = x.game_id AND e.type IN ('goal','sevenGoal') AND e.seq < x.seq AND e.t >= x.t - ${span} AND e.team_id = x.team_id) AS bf,
      (SELECT COUNT(*) FROM events e WHERE e.game_id = x.game_id AND e.type IN ('goal','sevenGoal') AND e.seq < x.seq AND e.t >= x.t - ${span} AND e.team_id <> x.team_id) AS ba,
      (SELECT COUNT(*) FROM events e WHERE e.game_id = x.game_id AND e.type IN ('goal','sevenGoal') AND e.seq > x.seq AND e.t <= x.t + ${span} AND e.team_id = x.team_id) AS af,
      (SELECT COUNT(*) FROM events e WHERE e.game_id = x.game_id AND e.type IN ('goal','sevenGoal') AND e.seq > x.seq AND e.t <= x.t + ${span} AND e.team_id <> x.team_id) AS aa
    FROM tos x JOIN teams t ON t.id = x.team_id`), [scope, f.team, span]);

  const effect = useMemo(() => {
    const delta = timeouts.map((r) => (r.af - r.aa) - (r.bf - r.ba));
    const s = sd(delta);
    const t = mean(delta) / (s / Math.sqrt(delta.length));
    const perTeam = new Map<string, number[]>();
    timeouts.forEach((r, i) => (perTeam.get(r.team) ?? perTeam.set(r.team, []).get(r.team)!).push(delta[i]));
    return {
      n: delta.length, before: mean(timeouts.map((r) => r.bf - r.ba)), after: mean(timeouts.map((r) => r.af - r.aa)), delta: mean(delta), ci: ci95(delta), p: pFromT(t, delta.length - 1),
      teams: [...perTeam].map(([Team, d]) => ({ Team, Auszeiten: d.length, 'Ø Δ Diff': mean(d), SD: sd(d) })).sort((a, b) => b['Ø Δ Diff'] - a['Ø Δ Diff']),
    };
  }, [timeouts]);

  if (!nGames) return <p>Keine Spiele mit Spielbericht für diese Auswahl.</p>;
  const keys = f.team ? ['Team', 'Gegner'] : ['Gesamt'];
  return (
    <>
      <Section title="Ereignisse nach Spielabschnitt" note={`Durchschnitt pro Spiel, 5-Minuten-Abschnitte, ${nGames} Spiele mit Bericht.${f.team ? ' Team = ausgewähltes Team, Gegner = dessen Gegner.' : ' Beide Teams zusammen.'}`}
        actions={<Select label="Wert" value={metric} options={Object.entries(METRICS).map(([value, [label]]) => ({ value: value as Metric, label }))} onChange={setMetric} />}>
        <Plot data={keys.map((k, i) => ({ type: 'bar' as const, name: k, x: buckets.map((b) => b.Minuten), y: buckets.map((b) => (b as Record<string, number | string>)[k] as number), marker: { color: series(i) },
          hovertemplate: `${k} · Min. %{x}: %{y:.3f} pro Spiel<extra></extra>` }))}
          layout={{ barmode: 'group', xaxis: { title: { text: 'Spielminute' }, type: 'category' }, yaxis: { title: { text: `${METRICS[metric][0]} pro Spiel` } },
            shapes: [{ type: 'line', x0: 5.5, x1: 5.5, yref: 'paper', y0: 0, y1: 1, line: { dash: 'dot', width: 1, color: '#898781' } }] }} />
        <DataTable name={`abschnitte-${metric}`} rows={buckets} limit={20} />
      </Section>

      <Section title={f.team ? 'Ø Tordifferenz im Spielverlauf' : 'Ø Abstand der Teams im Spielverlauf'}
        note={f.team ? 'Spielstand aus Sicht des Teams nach jeder Minute; Band = ± 1 Standardabweichung.' : 'Betrag der Tordifferenz nach jeder Minute; Band = ± 1 Standardabweichung. Team wählen für die Sicht eines Teams.'}>
        <Plot data={[
          { type: 'scatter', mode: 'lines', x: curve.map((c) => c.m), y: curve.map((c) => c.mean + c.sd), line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
          { type: 'scatter', mode: 'lines', x: curve.map((c) => c.m), y: curve.map((c) => c.mean - c.sd), line: { width: 0 }, fill: 'tonexty', fillcolor: 'rgba(42,120,214,0.15)', hoverinfo: 'skip', showlegend: false },
          { type: 'scatter', mode: 'lines', name: 'Mittelwert', x: curve.map((c) => c.m), y: curve.map((c) => c.mean), line: { width: 2, color: series(0) },
            customdata: curve.map((c) => c.sd), hovertemplate: 'Min. %{x}: %{y:.2f} (SD %{customdata:.2f})<extra></extra>' },
        ]} layout={{ showlegend: false, xaxis: { title: { text: 'Spielminute' }, dtick: 5 }, yaxis: { title: { text: 'Tore' }, zeroline: true } }} />
      </Section>

      <Section title="Wirkung von Auszeiten" note={`Tordifferenz des Teams, das die Auszeit nimmt, in den ${span / 60} Minuten vor und nach der Auszeit. Ohne Auszeiten in den ersten bzw. letzten ${span / 60} Minuten. Achtung: Auszeiten werden oft nach schwachen Phasen genommen, ein Teil der Verbesserung ist Regression zur Mitte.`}
        actions={<Select label="Fenster" value={span} options={[60, 120, 180, 300].map((s) => ({ value: s, label: `${s / 60} Min` }))} onChange={setSpan} />}>
        <Tiles items={[
          { label: 'Auszeiten', value: num(effect.n) },
          { label: 'Ø Diff davor', value: signed(effect.before) },
          { label: 'Ø Diff danach', value: signed(effect.after) },
          { label: 'Veränderung', value: signed(effect.delta), sub: `95 %-KI ${signed(effect.ci[0])} bis ${signed(effect.ci[1])} · p = ${effect.p < 0.001 ? '< 0,001' : num(effect.p, 3)}`, title: 'Gepaarter t-Test' },
        ]} />
        <div className="grid2">
          <Plot data={[{ type: 'histogram', x: timeouts.map((r) => (r.af - r.aa) - (r.bf - r.ba)), xbins: { size: 1 }, marker: { color: series(0) }, hovertemplate: 'Δ %{x}: %{y} Auszeiten<extra></extra>' }]}
            layout={{ xaxis: { title: { text: 'Δ Tordifferenz (danach − davor)' } }, yaxis: { title: { text: 'Auszeiten' } } }} />
          <DataTable name="auszeiten-teams" rows={effect.teams} maxHeight={360} limit={100} />
        </div>
      </Section>
    </>
  );
}
