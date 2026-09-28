import { Link } from 'react-router';
import type { League, TableRow } from '../../../shared/types.ts';
import { useFavorites } from '../lib/favorites.ts';
import { signed } from '../lib/format.ts';
import { formOf } from '../lib/standings.ts';
import { TeamLogo } from './TeamLogo.tsx';
import { FormBadges } from './ui.tsx';

export function StandingsTable({
  league,
  rows,
  compact,
  highlight,
}: {
  league: League;
  rows: TableRow[];
  compact?: boolean;
  highlight?: number;
}) {
  const favorites = useFavorites();
  return (
    <div className="card overflow-hidden">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-(--color-line) text-xs text-(--color-ink-3)">
            <th className="w-8 py-2 pl-3 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Mannschaft</th>
            <th className="px-1.5 py-2 text-center font-medium" title="Spiele">Sp</th>
            {!compact && (
              <>
                <th className="hidden px-1.5 py-2 text-center font-medium sm:table-cell" title="Siege">S</th>
                <th className="hidden px-1.5 py-2 text-center font-medium sm:table-cell" title="Unentschieden">U</th>
                <th className="hidden px-1.5 py-2 text-center font-medium sm:table-cell" title="Niederlagen">N</th>
                <th className="hidden px-1.5 py-2 text-center font-medium md:table-cell">Tore</th>
              </>
            )}
            <th className="px-1.5 py-2 text-center font-medium" title="Tordifferenz">Diff</th>
            {!compact && <th className="hidden px-2 py-2 text-left font-medium lg:table-cell">Form</th>}
            <th className="py-2 pr-3 pl-1.5 text-right font-medium">Pkt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isFav = favorites.includes(r.team);
            const marked = r.teamId === highlight || isFav;
            return (
              <tr
                key={r.teamId}
                className={`border-b border-(--color-line) last:border-0 ${marked ? 'bg-(--color-brand)/10' : ''}`}
              >
                <td className="py-2 pl-3 font-semibold text-(--color-ink-2)">{r.rank}</td>
                <td className="max-w-0 py-2">
                  <Link to={`/team/${r.teamId}`} className="flex min-w-0 items-center gap-2 hover:underline">
                    <TeamLogo teamId={r.teamId} name={r.team} size={22} />
                    <span className={`truncate ${marked ? 'font-semibold' : ''}`}>{r.team}</span>
                  </Link>
                </td>
                <td className="px-1.5 py-2 text-center">{r.played}</td>
                {!compact && (
                  <>
                    <td className="hidden px-1.5 py-2 text-center sm:table-cell">{r.won}</td>
                    <td className="hidden px-1.5 py-2 text-center sm:table-cell">{r.drawn}</td>
                    <td className="hidden px-1.5 py-2 text-center sm:table-cell">{r.lost}</td>
                    <td className="hidden px-1.5 py-2 text-center whitespace-nowrap md:table-cell">
                      {r.goalsFor}:{r.goalsAgainst}
                    </td>
                  </>
                )}
                <td className="px-1.5 py-2 text-center text-(--color-ink-2)">{signed(r.goalsFor - r.goalsAgainst)}</td>
                {!compact && (
                  <td className="hidden px-2 py-2 lg:table-cell">
                    <FormBadges form={formOf(league.games, r.teamId)} />
                  </td>
                )}
                <td className="py-2 pr-3 pl-1.5 text-right font-bold whitespace-nowrap">
                  {r.pointsPlus}
                  <span className="font-normal text-(--color-ink-3)">:{r.pointsMinus}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
