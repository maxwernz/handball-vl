import { Link, useParams } from 'react-router';
import { usePlayer } from '../api.ts';
import { GameBars, PeriodBars } from '../components/charts.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { ErrorBox, Loading, Section, StatTile } from '../components/ui.tsx';
import { formatDay, perGame, percent } from '../lib/format.ts';

export function PlayerPage() {
  const key = useParams().key!;
  const { data: p, isLoading, error } = usePlayer(key);
  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorBox error={error} />;

  return (
    <div>
      <div className="card mb-4 flex items-center gap-4 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-(--color-brand) text-2xl font-extrabold text-white">
          {p.no}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{p.name}</h1>
          <Link to={`/team/${p.teamId}`} className="mt-1 flex items-center gap-2 text-sm text-(--color-ink-2) hover:underline">
            <TeamLogo teamId={p.teamId} name={p.team} size={20} />
            {p.team}
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tore" value={p.goals} hint={p.rankInLeague ? `Platz ${p.rankInLeague} der Liga` : undefined} />
        <StatTile label="Tore pro Spiel" value={perGame(p.goals, p.games)} hint={`${p.games} Spiele`} />
        <StatTile label="7-Meter" value={`${p.sevenGoals}/${p.sevenAttempts}`} hint={p.sevenAttempts ? `Quote ${percent(p.sevenGoals, p.sevenAttempts)}` : 'keine Versuche'} />
        <StatTile label="Strafen" value={p.twoMinutes} hint={`Zeitstrafen · ${p.warnings} Gelb · ${p.disqualifications} Rot`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Tore pro Spiel</h3>
          <GameBars
            data={p.log.map((g) => ({
              label: g.opponent.length > 11 ? `${g.opponent.slice(0, 10)}…` : g.opponent,
              value: g.goals,
              detail: `${formatDay(g.date)} ${g.home ? 'vs.' : '@'} ${g.opponent}`,
            }))}
          />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Tore nach Spielabschnitt</h3>
          <PeriodBars series={[{ label: 'Tore', values: p.goalsByPeriod, color: 'var(--color-brand)' }]} />
        </div>
      </div>

      <div className="mt-6">
        <Section title="Alle Spiele">
          <div className="card overflow-hidden">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-xs text-(--color-ink-3)">
                  <th className="py-2 pl-3 text-left font-medium">Datum</th>
                  <th className="py-2 text-left font-medium">Gegner</th>
                  <th className="px-2 py-2 text-right font-medium">Erg.</th>
                  <th className="px-2 py-2 text-right font-medium">Tore</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">7m</th>
                  <th className="py-2 pr-3 pl-2 text-right font-medium">Strafen</th>
                </tr>
              </thead>
              <tbody>
                {[...p.log].reverse().map((g) => (
                  <tr key={g.gameId} className="border-b border-(--color-line) last:border-0 hover:bg-(--color-surface-2)">
                    <td className="py-2 pl-3 whitespace-nowrap text-(--color-ink-2)">{formatDay(g.date)}</td>
                    <td className="max-w-0 truncate py-2">
                      <Link to={`/spiel/${g.gameId}`} className="hover:underline">
                        {g.home ? 'vs.' : '@'} {g.opponent}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right text-(--color-ink-2)">{g.result}</td>
                    <td className="px-2 py-2 text-right font-semibold">{g.goals}</td>
                    <td className="hidden px-2 py-2 text-right text-(--color-ink-2) sm:table-cell">{g.sevenAttempts ? `${g.sevenGoals}/${g.sevenAttempts}` : ''}</td>
                    <td className="py-2 pr-3 pl-2 text-right whitespace-nowrap">
                      {g.warning && <span className="mr-1 inline-block h-3.5 w-2.5 rounded-sm bg-(--color-draw) align-middle" title="Verwarnung" />}
                      {g.twoMinutes > 0 && <span className="text-xs font-bold">{g.twoMinutes}× 2'</span>}
                      {g.disqualification && <span className="ml-1 inline-block h-3.5 w-2.5 rounded-sm bg-(--color-loss) align-middle" title="Disqualifikation" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
