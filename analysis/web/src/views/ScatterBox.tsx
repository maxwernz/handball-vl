import { useMemo, useState } from 'react';
import type { SqlValue } from 'sql.js';
import { Plot, Section, Select, series } from '../components.tsx';
import { num } from '../format.ts';
import { regression } from '../stats.ts';

/** Scatter of two numeric columns with OLS line, Pearson r, R² and p value. */
export function ScatterBox({ title, rows, label, x: x0, y: y0, highlight, note }: {
  title: string; rows: Record<string, SqlValue>[]; label: string; x: string; y: string; highlight?: (row: Record<string, SqlValue>) => boolean; note?: string;
}) {
  const numeric = useMemo(() => Object.keys(rows[0] ?? {}).filter((k) => rows.some((r) => typeof r[k] === 'number')), [rows]);
  const [x, setX] = useState(x0);
  const [y, setY] = useState(y0);
  const xs = rows.map((r) => (typeof r[x] === 'number' ? (r[x] as number) : NaN));
  const ys = rows.map((r) => (typeof r[y] === 'number' ? (r[y] as number) : NaN));
  const reg = regression(xs, ys);
  const valid = xs.filter(Number.isFinite);
  const lo = Math.min(...valid), hi = Math.max(...valid);
  const hl = rows.map((r) => !!highlight?.(r));
  const pick = (want: boolean) => {
    const idx = rows.map((_, i) => i).filter((i) => hl[i] === want);
    return { x: idx.map((i) => xs[i]), y: idx.map((i) => ys[i]), text: idx.map((i) => String(rows[i][label])) };
  };
  return (
    <Section title={title} note={note} actions={
      <div className="inline-fields">
        <Select label="x" value={x} options={numeric.map((k) => ({ value: k, label: k }))} onChange={setX} />
        <Select label="y" value={y} options={numeric.map((k) => ({ value: k, label: k }))} onChange={setY} />
      </div>}>
      <p className="stat-line">
        {reg ? <>n = {reg.n} · r = {num(reg.r, 3)} · R² = {num(reg.r2, 3)} · p = {reg.p < 0.001 ? '< 0,001' : num(reg.p, 3)} · y = {num(reg.slope, 3)}·x {reg.intercept >= 0 ? '+' : '−'} {num(Math.abs(reg.intercept), 3)}</> : 'Zu wenig Daten für eine Regression.'}
      </p>
      <Plot height={420} data={[
        { type: 'scatter', mode: 'markers', name: 'Teams', ...pick(false), marker: { size: 9, color: series(0), line: { width: 1, color: 'rgba(255,255,255,0.8)' } }, hovertemplate: `%{text}<br>${x}: %{x:.3f}<br>${y}: %{y:.3f}<extra></extra>` },
        ...(hl.some(Boolean) ? [{ type: 'scatter' as const, mode: 'text+markers' as const, name: 'Auswahl', ...pick(true), textposition: 'top center' as const, marker: { size: 12, color: series(1) }, hovertemplate: `%{text}<br>${x}: %{x:.3f}<br>${y}: %{y:.3f}<extra></extra>` }] : []),
        ...(reg ? [{ type: 'scatter' as const, mode: 'lines' as const, name: 'Regression', x: [lo, hi], y: [reg.intercept + reg.slope * lo, reg.intercept + reg.slope * hi], line: { dash: 'dash' as const, width: 1.5, color: '#898781' }, hoverinfo: 'skip' as const }] : []),
      ]} layout={{ xaxis: { title: { text: x } }, yaxis: { title: { text: y } } }} />
    </Section>
  );
}
