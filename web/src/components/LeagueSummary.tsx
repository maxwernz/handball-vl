import { Link } from 'react-router';
import type { GameRecord, StatsResponse } from '../../../shared/types.ts';
import { percent } from '../lib/format.ts';
import { TeamLogo } from './TeamLogo.tsx';

function RecordRow({ label, game, value }: { label: string; game: GameRecord | null; value: (g: GameRecord) => string }) {
  return (
    <div className="py-2 text-sm">
      <div className="text-xs text-(--color-ink-3)">{label}</div>
      {game ? (
        <Link to={`/spiel/${game.gameId}`} className="block truncate hover:underline">
          <span className="tabular font-semibold">{game.score}</span> {game.home} – {game.guest}
          <span className="text-(--color-ink-3)"> · {value(game)}</span>
        </Link>
      ) : (
        '–'
      )}
    </div>
  );
}

/** Home advantage and season records of a league (or all leagues). */
export function LeagueSummaryView({ data }: { data: StatsResponse }) {
  const s = data.summary;
  if (!s) return null; // data cached offline before this existed
  const games = s.homeWins + s.draws + s.awayWins;
  if (!games) return null;
  const top = s.topPlayerGame;
  const bar = [
    { label: 'Heimsiege', value: s.homeWins, color: 'var(--color-home)' },
    { label: 'Unentschieden', value: s.draws, color: 'var(--color-ink-3)' },
    { label: 'Auswärtssiege', value: s.awayWins, color: 'var(--color-guest)' },
  ];
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card min-w-0 p-4">
        <h3 className="mb-3 font-semibold">Heimvorteil</h3>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {bar.map((b) => b.value > 0 && <div key={b.label} style={{ width: `${(b.value / games) * 100}%`, background: b.color }} />)}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {bar.map((b) => (
            <div key={b.label}>
              <div className="tabular text-lg font-bold">{percent(b.value, games)}</div>
              <div className="text-xs text-(--color-ink-3)">
                {b.label} ({b.value})
              </div>
            </div>
          ))}
        </div>
        {s.avgSpectators !== null && (
          <p className="mt-3 border-t border-(--color-line) pt-2 text-sm text-(--color-ink-2)">
            Im Schnitt <strong className="text-(--color-ink)">{s.avgSpectators}</strong> Zuschauer pro Spiel
          </p>
        )}
      </div>
      <div className="card min-w-0 divide-y divide-(--color-line) px-4 py-2">
        <h3 className="py-2 font-semibold">Rekorde der Saison</h3>
        <RecordRow label="Höchster Sieg" game={s.biggestWin} value={(g) => `${g.value} Tore Differenz`} />
        <RecordRow label="Torreichstes Spiel" game={s.mostGoals} value={(g) => `${g.value} Tore`} />
        <div className="py-2 text-sm">
          <div className="text-xs text-(--color-ink-3)">Meiste Tore in einem Spiel</div>
          {top ? (
            <span className="flex min-w-0 items-center gap-2">
              <TeamLogo teamId={top.teamId} name={top.team} size={20} />
              <Link to={`/spieler/${top.key}`} className="truncate hover:underline">
                <span className="font-semibold">{top.goals}</span> {top.name}
              </Link>
              <Link to={`/spiel/${top.gameId}`} className="shrink-0 text-(--color-ink-3) hover:underline">
                vs. {top.opponent}
              </Link>
            </span>
          ) : (
            '–'
          )}
        </div>
      </div>
    </div>
  );
}
