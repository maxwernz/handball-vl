import { useMemo, useState } from 'react';
import type { SqlValue } from 'sql.js';
import schemaDoc from '../../../SCHEMA.md?raw';
import { rows, run, type Result } from '../db.ts';
import { DataTable, Plot, Section, Select, series, type Trace } from '../components.tsx';
import { leagueWhere } from '../scope.ts';
import type { ViewProps } from './types.ts';

const EXAMPLES: [string, string][] = [
  ['Tore nach Spielminute', `SELECT minute, COUNT(*) AS tore FROM events WHERE type IN ('goal','sevenGoal') GROUP BY minute ORDER BY minute`],
  ['Heimvorteil je Liga', `SELECT l.short AS liga, COUNT(*) AS spiele, AVG(g.home_goals - g.guest_goals) AS heim_diff, AVG(g.home_goals > g.guest_goals) AS heimsiege
FROM games g JOIN leagues l ON l.id = g.league_id WHERE g.status = 'finished' GROUP BY l.id ORDER BY heim_diff DESC`],
  ['Tore in knapper Schlussphase', `SELECT t.name AS team, COUNT(*) AS tore_letzte_5_min_knapp
FROM team_events e JOIN teams t ON t.id = e.team_id
WHERE e.type IN ('goal','sevenGoal') AND e.by_team = 1 AND e.t >= 3300 AND ABS(e.lead_before) <= 2
GROUP BY e.team_id ORDER BY 2 DESC`],
  ['Strafen nach Spielstand', `SELECT CASE WHEN score_for > score_against THEN 'Führung' WHEN score_for < score_against THEN 'Rückstand' ELSE 'Gleichstand' END AS stand,
  COUNT(*) AS strafen FROM penalties GROUP BY stand`],
  ['Zuschauer vs. Tore', `SELECT g.home, g.guest, g.spectators, g.home_goals + g.guest_goals AS tore, l.short AS liga
FROM games g JOIN leagues l ON l.id = g.league_id WHERE g.spectators > 0`],
];

export function SqlConsole({ f }: ViewProps) {
  const [sql, setSql] = useState(`-- Aktuelle Filter als Bedingung: ${leagueWhere(f)}\n${EXAMPLES[0][1]}`);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState(0);
  const execute = () => {
    const start = performance.now();
    try { setResult(run(sql)); setError(null); } catch (e) { setError((e as Error).message); setResult(null); }
    setMs(performance.now() - start);
  };
  const tables = useMemo(() => rows<{ name: string; cols: string }>(`SELECT m.name, group_concat(p.name, ', ') AS cols
    FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type IN ('table','view') GROUP BY m.name ORDER BY m.name`), []);
  const objects = useMemo(() => result?.rows.map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]]))) ?? [], [result]);

  return (
    <>
      <Section title="SQL-Abfrage" note={<>SQLite im Browser, nur auf deiner Kopie der Datenbank. Strg/⌘ + Enter führt aus. Filter der Seite gelten hier nicht – Bedingung steht oben als Kommentar.</>}>
        <div className="examples">
          {EXAMPLES.map(([label, q]) => <button key={label} onClick={() => setSql(q)}>{label}</button>)}
        </div>
        <textarea className="sql" value={sql} spellCheck={false} rows={10} onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); execute(); } }} />
        <div className="table-tools">
          <button className="primary" onClick={execute}>Ausführen</button>
          {result ? <span>{result.rows.length} Zeilen · {ms.toFixed(0)} ms</span> : null}
        </div>
        {error ? <pre className="error">{error}</pre> : null}
        {result ? <DataTable key={sql + ms} name="abfrage" rows={objects} limit={200} maxHeight={500} /> : null}
      </Section>
      {result && result.columns.length ? <ChartBuilder columns={result.columns} rows={result.rows} /> : null}
      <Section title="Tabellen und Spalten">
        <table className="schema"><tbody>{tables.map((t) => <tr key={t.name}><th>{t.name}</th><td>{t.cols}</td></tr>)}</tbody></table>
        <details><summary>Ausführliche Beschreibung (SCHEMA.md)</summary><pre className="doc">{schemaDoc}</pre></details>
      </Section>
    </>
  );
}

type Kind = 'bar' | 'line' | 'scatter' | 'histogram' | 'box';

function ChartBuilder({ columns, rows: data }: { columns: string[]; rows: SqlValue[][] }) {
  const [kind, setKind] = useState<Kind>('bar');
  const [x, setX] = useState(columns[0]);
  const [y, setY] = useState(columns[1] ?? columns[0]);
  const [group, setGroup] = useState('');
  const col = (name: string) => columns.indexOf(name);
  const xi = col(x) < 0 ? 0 : col(x), yi = col(y) < 0 ? Math.min(1, columns.length - 1) : col(y), gi = col(group);
  const groups = gi < 0 ? [null] : [...new Set(data.map((r) => r[gi]))];
  const shown = groups.slice(0, 8);
  const traces: Trace[] = shown.map((g, i) => {
    const part = gi < 0 ? data : data.filter((r) => r[gi] === g);
    const name = g === null ? y : String(g);
    const color = series(i);
    switch (kind) {
      case 'histogram': return { type: 'histogram', name, x: part.map((r) => r[xi]), marker: { color }, opacity: groups.length > 1 ? 0.7 : 1 };
      case 'box': return { type: 'box', name, x: gi < 0 ? undefined : part.map(() => name), y: part.map((r) => r[yi]), marker: { color }, boxmean: true };
      case 'scatter': return { type: 'scatter', mode: 'markers', name, x: part.map((r) => r[xi]), y: part.map((r) => r[yi]), marker: { color, size: 8 } };
      case 'line': return { type: 'scatter', mode: 'lines+markers', name, x: part.map((r) => r[xi]), y: part.map((r) => r[yi]), line: { color, width: 2 } };
      default: return { type: 'bar', name, x: part.map((r) => r[xi]), y: part.map((r) => r[yi]), marker: { color } };
    }
  }) as Trace[];
  const opts = columns.map((c) => ({ value: c, label: c }));
  return (
    <Section title="Diagramm aus dem Ergebnis" note={groups.length > 8 ? `Gruppierung hat ${groups.length} Werte, gezeigt werden die ersten 8.` : undefined}
      actions={<div className="inline-fields">
        <Select label="Art" value={kind} options={[['bar', 'Balken'], ['line', 'Linie'], ['scatter', 'Punkte'], ['histogram', 'Histogramm'], ['box', 'Box-Plot']].map(([value, label]) => ({ value: value as Kind, label }))} onChange={setKind} />
        {kind !== 'box' ? <Select label="x" value={x} options={opts} onChange={setX} /> : null}
        {kind !== 'histogram' ? <Select label="y" value={y} options={opts} onChange={setY} /> : null}
        <Select label="Gruppe" value={group} options={[{ value: '', label: '–' }, ...opts]} onChange={setGroup} />
      </div>}>
      <Plot height={420} data={traces} layout={{ barmode: kind === 'histogram' ? 'overlay' : 'group', showlegend: shown.length > 1,
        xaxis: { title: { text: kind === 'box' ? group : x } }, yaxis: { title: { text: kind === 'histogram' ? 'Anzahl' : y } } }} />
    </Section>
  );
}
