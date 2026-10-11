import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { PlayerDetail } from '../../../shared/types.ts';
import { usePlayer, useStats } from '../api.ts';
import { CompareBar, PeriodBars } from '../components/charts.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Empty, ErrorBox, Loading } from '../components/ui.tsx';
import { matcher } from '../lib/search.ts';

const MAX_RESULTS = 8;

/** Search field that picks a player; `exclude` is the one already chosen on the other side. */
function PlayerPicker({ exclude, onPick }: { exclude: string | null; onPick: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const { data: stats } = useStats(null);
  const matches = matcher(query);
  const players = matches ? (stats?.players ?? []).filter((p) => p.key !== exclude && matches(p.name)).sort((a, b) => b.goals - a.goals) : [];
  return (
    <div className="card p-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Spieler suchen"
        aria-label="Spieler zum Vergleichen suchen"
        className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
      />
      {players.slice(0, MAX_RESULTS).map((p) => (
        <button key={p.key} onClick={() => onPick(p.key)} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-(--color-surface-2)">
          <TeamLogo teamId={p.teamId} name={p.team} size={22} />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <span className="tabular shrink-0 text-xs text-(--color-ink-3)">{p.goals} Tore</span>
        </button>
      ))}
      {matches && stats && !players.length && <p className="mt-2 px-1 text-xs text-(--color-ink-3)">Niemand gefunden.</p>}
    </div>
  );
}

function Head({ player, side, onChange }: { player: PlayerDetail; side: 'home' | 'guest'; onChange: () => void }) {
  return (
    <div className={`min-w-0 ${side === 'guest' ? 'text-right' : ''}`}>
      <div className={`flex items-center gap-2 ${side === 'guest' ? 'flex-row-reverse' : ''}`}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `var(--color-${side})` }} />
        <Link to={`/spieler/${player.key}`} className="truncate font-semibold hover:underline">
          {player.name}
        </Link>
      </div>
      <div className="truncate text-xs text-(--color-ink-3)">{player.team}</div>
      <button onClick={onChange} className="text-xs font-medium text-(--color-brand) hover:underline">
        ändern
      </button>
    </div>
  );
}

/** Two players of the season side by side. */
export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const keys = { a: params.get('a'), b: params.get('b') };
  const set = (slot: 'a' | 'b', key: string | null) => {
    const next = { ...keys, [slot]: key };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Record<string, string>, { replace: true });
  };
  const a = usePlayer(keys.a ?? '');
  const b = usePlayer(keys.b ?? '');
  const slot = (id: 'a' | 'b', q: typeof a, side: 'home' | 'guest') =>
    !keys[id] ? (
      <PlayerPicker exclude={keys[id === 'a' ? 'b' : 'a']} onPick={(key) => set(id, key)} />
    ) : q.data ? (
      <Head player={q.data} side={side} onChange={() => set(id, null)} />
    ) : q.error ? (
      <ErrorBox error={q.error} />
    ) : (
      <div className="card h-16 animate-pulse" />
    );
  const rate = (made: number, attempts: number) => (attempts ? made / attempts : 0);
  const decimal = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  const x = a.data;
  const y = b.data;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-bold">Spielervergleich</h1>
      <div className="mb-4 grid grid-cols-2 items-start gap-3">
        {slot('a', a, 'home')}
        {slot('b', b, 'guest')}
      </div>
      {keys.a && keys.b && (a.isLoading || b.isLoading) && <Loading />}
      {(!keys.a || !keys.b) && <Empty>Wähle zwei Spieler, um ihre Saison zu vergleichen.</Empty>}
      {x && y && keys.a && keys.b && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card px-4 py-2">
            <CompareBar label="Tore" home={x.goals} guest={y.goals} />
            <CompareBar label="Spiele" home={x.games} guest={y.games} />
            <CompareBar label="Tore pro Spiel" home={rate(x.goals, x.games)} guest={rate(y.goals, y.games)} format={decimal} />
            <CompareBar label="Feldtore" home={x.goals - x.sevenGoals} guest={y.goals - y.sevenGoals} />
            <CompareBar label="7-Meter-Tore" home={x.sevenGoals} guest={y.sevenGoals} />
            <CompareBar label="7-Meter-Quote" home={rate(x.sevenGoals, x.sevenAttempts)} guest={rate(y.sevenGoals, y.sevenAttempts)} format={pct} />
            <CompareBar label="Anteil an Teamtoren" home={rate(x.goals, x.teamGoals)} guest={rate(y.goals, y.teamGoals)} format={pct} />
            <CompareBar label="Bestes Spiel" home={x.bestGame?.goals ?? 0} guest={y.bestGame?.goals ?? 0} />
            <CompareBar label="Spiele in Folge mit Tor" home={x.longestStreak} guest={y.longestStreak} />
            <CompareBar label="Zeitstrafen" home={x.twoMinutes} guest={y.twoMinutes} />
          </div>
          <div className="card p-4">
            <h3 className="mb-2 font-semibold">Tore nach Spielabschnitt</h3>
            <PeriodBars
              series={[
                { label: x.name, values: x.goalsByPeriod, color: 'var(--color-home)' },
                { label: y.name, values: y.goalsByPeriod, color: 'var(--color-guest)' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
