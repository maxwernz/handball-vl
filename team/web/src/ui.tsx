import { useMemo, useState, type ReactNode } from 'react';
import type { StatGame } from '../../lib/model.ts';
import { resultOf } from '../../lib/stats.ts';

export const fmtPct = (v: number | null, digits = 0) => (v === null ? '–' : `${(v * 100).toFixed(digits).replace('.', ',')} %`);
export const fmtNum = (v: number, digits = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(digits).replace('.', ','));
export const fmtClock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function fmtDate(iso: string, withDay = true) {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00` : iso);
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  return withDay ? `${WD[d.getDay()]} ${date}` : date;
}

/** "SG Nürtingen-Zizishausen" → "SG Nürtingen-Zizish." for tight axis labels. */
export const shortName = (name: string, max = 14) => (name.length <= max ? name : `${name.slice(0, max - 1).trimEnd()}.`);

export const venue = (g: StatGame) => (g.home === null ? 'vs.' : g.home ? 'gegen' : 'bei');

export function ResultBadge({ game }: { game: Pick<StatGame, 'goalsFor' | 'goalsAgainst'> }) {
  const r = resultOf(game);
  const label = { S: 'Sieg', U: 'Unentschieden', N: 'Niederlage' }[r];
  return (
    <span className={`badge badge-${r}`} title={label} aria-label={label}>
      {r}
    </span>
  );
}

export function Tile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={`tile${accent ? ' tile-accent' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub !== undefined && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Card({ title, sub, actions, children, className = '' }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export interface Column<R> {
  key: string;
  label: ReactNode;
  title?: string;
  value: (r: R) => number | string | null;
  render?: (r: R) => ReactNode;
  className?: string;
  /** Sort descending first (numbers). */
  desc?: boolean;
}

export function SortTable<R>({ rows, columns, initial, rowKey, onRow, footer, sticky = true }: {
  rows: R[];
  columns: Column<R>[];
  initial: string;
  rowKey: (r: R) => string;
  onRow?: (r: R) => void;
  footer?: ReactNode;
  sticky?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initial, dir: columns.find((c) => c.key === initial)?.desc === false ? 1 : -1 });
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
  }, [rows, columns, sort]);
  return (
    <div className="table-wrap">
      <table className={`table${sticky ? ' sticky-first' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = c.key === sort.key;
              return (
                <th key={c.key} className={c.className} title={c.title} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button onClick={() => setSort({ key: c.key, dir: active ? (-sort.dir as 1 | -1) : c.desc === false ? 1 : -1 })}>
                    {c.label}
                    <span className="sort-mark" aria-hidden>{active ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render ? c.render(r) : c.value(r) ?? '–'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="legend">
      {items.map(([cls, label]) => (
        <span key={label}>
          <i className={`swatch ${cls}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Glossary({ items }: { items: [string, string][] }) {
  return (
    <dl className="glossary">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
