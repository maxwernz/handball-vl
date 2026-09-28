import { Link } from 'react-router';
import type { TableRow } from '../../../shared/types.ts';
import { useFavorites } from '../lib/favorites.ts';
import { unitTable, type Unit } from '../lib/standings.ts';
import { TeamLogo } from './TeamLogo.tsx';

const format = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Attack (goals per game) or defense (goals conceded per game) ranking of a league. */
export function UnitTable({ rows, unit }: { rows: TableRow[]; unit: Unit }) {
  const favorites = useFavorites();
  const table = unitTable(rows, unit);
  const values = table.map((r) => r.perGame).filter((v): v is number => v !== null);
  // Bars start a little below the weakest value so differences are visible.
  const max = Math.max(...values, 1);
  const min = Math.max(0, Math.min(...values, max) - 4);
  const label = unit === 'attack' ? 'Tore' : 'Gegentore';

  return (
    <div className="card overflow-hidden">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-(--color-line) text-xs text-(--color-ink-3)">
            <th className="w-8 py-2 pl-3 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Mannschaft</th>
            <th className="px-1.5 py-2 text-center font-medium" title="Spiele">Sp</th>
            <th className="hidden px-1.5 py-2 text-center font-medium sm:table-cell">{label}</th>
            <th className="w-[38%] py-2 pr-3 pl-2 text-right font-medium sm:w-[34%]" title={`${label} pro Spiel`}>
              Ø pro Spiel
            </th>
            <th className="hidden py-2 pr-3 text-right font-medium md:table-cell" title="Platz in der Tabelle">
              Tabelle
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((r) => {
            const marked = favorites.includes(r.team);
            const share = r.perGame === null ? 0 : ((r.perGame - min) / (max - min || 1)) * 100;
            return (
              <tr key={r.teamId} className={`border-b border-(--color-line) last:border-0 ${marked ? 'bg-(--color-brand)/10' : ''}`}>
                <td className="py-2 pl-3 font-semibold text-(--color-ink-2)">{r.perGame === null ? '–' : r.rank}</td>
                <td className="max-w-0 py-2">
                  <Link to={`/team/${r.teamId}`} className="flex min-w-0 items-center gap-2 hover:underline">
                    <TeamLogo teamId={r.teamId} name={r.team} size={22} />
                    <span className={`truncate ${marked ? 'font-semibold' : ''}`}>{r.team}</span>
                  </Link>
                </td>
                <td className="px-1.5 py-2 text-center">{r.played}</td>
                <td className="hidden px-1.5 py-2 text-center sm:table-cell">{r.goals}</td>
                <td className="py-2 pr-3 pl-2">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-2 flex-1 overflow-hidden rounded-full bg-(--color-surface-2) sm:block">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, background: unit === 'attack' ? 'var(--color-home)' : 'var(--color-guest)' }}
                      />
                    </div>
                    <span className="w-9 text-right font-bold">{r.perGame === null ? '–' : format(r.perGame)}</span>
                  </div>
                </td>
                <td className="hidden py-2 pr-3 text-right text-(--color-ink-2) md:table-cell">{r.tableRank}.</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
