import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SqlValue } from 'sql.js';
import { num } from './format.ts';

/* ---------- Tables ---------- */

export interface Column {
  key: string;
  label?: string;
  title?: string; // tooltip explaining the metric
  digits?: number;
  format?: (value: SqlValue, row: Record<string, SqlValue>) => ReactNode;
}

const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const csvCell = (v: SqlValue, sep: string) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return sep === ';' ? String(v).replace('.', ',') : String(v);
  const s = String(v);
  return /[";\n\t,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toDelimited(columns: string[], rows: SqlValue[][], sep: string) {
  return [columns.join(sep), ...rows.map((r) => r.map((v) => csvCell(v, sep)).join(sep))].join('\n');
}

export function DataTable({ rows, columns, name, limit = 100, maxHeight }: {
  rows: Record<string, SqlValue>[];
  columns?: Column[];
  name: string;
  limit?: number;
  maxHeight?: number;
}) {
  const cols: Column[] = columns ?? (rows[0] ? Object.keys(rows[0]).map((key) => ({ key })) : []);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState('');
  const sorted = useMemo(() => {
    let out = rows;
    if (filter) {
      const f = filter.toLowerCase();
      out = out.filter((r) => cols.some((c) => typeof r[c.key] === 'string' && (r[c.key] as string).toLowerCase().includes(f)));
    }
    if (!sort) return out;
    return [...out].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de')) * sort.dir;
    });
  }, [rows, sort, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all ? sorted : sorted.slice(0, limit);
  const matrix = () => sorted.map((r) => cols.map((c) => r[c.key]));
  const labels = cols.map((c) => c.label ?? c.key);
  return (
    <div className="table-block">
      <div className="table-tools">
        <span>{sorted.length} Zeilen</span>
        <input type="search" placeholder="Text filtern …" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button onClick={() => download(`${name}.csv`, '﻿' + toDelimited(labels, matrix(), ';'), 'text/csv')}>CSV (Excel)</button>
        <button onClick={() => download(`${name}.csv`, toDelimited(cols.map((c) => c.key), matrix(), ','), 'text/csv')}>CSV (R/Python)</button>
        <button onClick={() => navigator.clipboard.writeText(toDelimited(labels, matrix(), '\t'))}>Kopieren</button>
      </div>
      <div className="table-scroll" style={maxHeight ? { maxHeight } : undefined}>
        <table>
          <thead>
            <tr>
              <th className="idx">#</th>
              {cols.map((c) => (
                <th key={c.key} title={c.title} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: -1 }))}
                  className={sort?.key === c.key ? 'sorted' : undefined}>
                  {c.label ?? c.key}{c.title ? <sup>?</sup> : null}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td className="idx">{i + 1}</td>
                {cols.map((c) => {
                  const v = r[c.key];
                  return <td key={c.key} className={typeof v === 'number' ? 'n' : undefined}>{c.format ? c.format(v, r) : num(v, c.digits ?? 2)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && !all ? <button className="more" onClick={() => setAll(true)}>Alle {sorted.length} Zeilen zeigen</button> : null}
    </div>
  );
}

/* ---------- Charts ---------- */

// Validated categorical order (blue, orange, aqua, yellow, magenta, green, violet, red).
export const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
export const series = (i: number) => (dark() ? SERIES.dark : SERIES.light)[i % 8];

let plotly: Promise<typeof import('plotly.js-dist-min').default> | null = null;
const loadPlotly = () => (plotly ??= import('plotly.js-dist-min').then((m) => m.default));

// Plotly's own types are very strict unions; the pages build plain objects instead.
export type Trace = Record<string, unknown>;
export type Layout = Record<string, unknown>;

export function Plot({ data, layout, height = 360 }: { data: Trace[]; layout?: Layout; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    loadPlotly().then((P) => {
      if (!alive || !ref.current) return;
      const d = dark();
      const ink = d ? '#c3c2b7' : '#52514e';
      const grid = d ? '#2c2c2a' : '#e1e0d9';
      const axis = { gridcolor: grid, zerolinecolor: d ? '#383835' : '#c3c2b7', linecolor: d ? '#383835' : '#c3c2b7', automargin: true };
      const base: Layout = {
        height,
        margin: { l: 50, r: 16, t: 30, b: 40 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 12, color: ink },
        colorway: d ? SERIES.dark : SERIES.light,
        legend: { orientation: 'h', y: 1.12, x: 0 },
        hovermode: 'closest',
        bargap: 0.08,
        separators: ',.',
      };
      const merged: Layout = { ...base, ...layout };
      for (const k of Object.keys(merged)) if (/^[xy]axis\d*$/.test(k)) merged[k] = { ...axis, ...(merged[k] as object) };
      if (!merged.xaxis) merged.xaxis = axis;
      if (!merged.yaxis) merged.yaxis = axis;
      P.react(ref.current, data as never, merged as never, { displaylogo: false, responsive: true, toImageButtonOptions: { format: 'png', scale: 2 } });
    });
    return () => { alive = false; };
  }, [data, layout, height]);
  useEffect(() => () => { if (ref.current) loadPlotly().then((P) => ref.current && P.purge(ref.current)); }, []);
  return <div ref={ref} className="plot" style={{ minHeight: height }} />;
}

/* ---------- Layout ---------- */

export function Tiles({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; title?: string }[] }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div className="tile" key={t.label} title={t.title}>
          <div className="tile-label">{t.label}</div>
          <div className="tile-value">{t.value}</div>
          {t.sub ? <div className="tile-sub">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Section({ title, note, children, actions }: { title: string; note?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <header><h2>{title}</h2>{actions}</header>
      {note ? <p className="note">{note}</p> : null}
      {children}
    </section>
  );
}

export function Select<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  );
}
