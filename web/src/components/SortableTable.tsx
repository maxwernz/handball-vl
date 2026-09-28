import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  id: string;
  label: string;
  title?: string;
  value: (row: T) => number | string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Hidden below this breakpoint to keep phone layouts readable. */
  hideBelow?: 'sm' | 'md' | 'lg';
  grow?: boolean;
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function SortableTable<T>({
  rows,
  columns,
  initialSort,
  rowKey,
  limit,
  rank = true,
}: {
  rows: T[];
  columns: Column<T>[];
  initialSort: string;
  rowKey: (row: T) => string | number;
  limit?: number;
  rank?: boolean;
}) {
  const [sort, setSort] = useState({ id: initialSort, desc: true });
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === sort.id) ?? columns[0];
    return [...rows].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de');
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, columns, sort]);
  const visible = limit && !expanded ? sorted.slice(0, limit) : sorted;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-(--color-line) text-xs text-(--color-ink-3)">
              {rank && <th className="w-8 py-2 pl-3 text-left font-medium">#</th>}
              {columns.map((c) => (
                <th
                  key={c.id}
                  title={c.title}
                  aria-sort={sort.id === c.id ? (sort.desc ? 'descending' : 'ascending') : undefined}
                  className={`px-2 py-2 font-medium whitespace-nowrap ${c.align === 'left' ? 'text-left' : 'text-right'} ${c.hideBelow ? HIDE[c.hideBelow] : ''} last:pr-3`}
                >
                  <button
                    className={`inline-flex items-center gap-0.5 hover:text-(--color-ink) ${sort.id === c.id ? 'text-(--color-ink)' : ''}`}
                    onClick={() => setSort((s) => ({ id: c.id, desc: s.id === c.id ? !s.desc : c.align !== 'left' }))}
                  >
                    {c.label}
                    {sort.id === c.id && <span aria-hidden>{sort.desc ? '↓' : '↑'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={rowKey(row)} className="border-b border-(--color-line) last:border-0 hover:bg-(--color-surface-2)">
                {rank && <td className="py-2 pl-3 text-(--color-ink-3)">{i + 1}</td>}
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={`px-2 py-2 ${c.align === 'left' ? 'text-left' : 'text-right'} ${c.grow ? 'w-full max-w-0' : 'whitespace-nowrap'} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${sort.id === c.id ? 'font-semibold' : ''} last:pr-3`}
                  >
                    {c.render ? c.render(row) : c.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && sorted.length > limit && (
        <button
          className="w-full border-t border-(--color-line) py-2.5 text-sm font-medium text-(--color-brand) hover:bg-(--color-surface-2)"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Weniger anzeigen' : `Alle ${sorted.length} anzeigen`}
        </button>
      )}
    </div>
  );
}
