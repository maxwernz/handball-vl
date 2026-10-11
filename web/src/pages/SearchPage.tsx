import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMeta, useStats } from '../api.ts';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Empty, Section } from '../components/ui.tsx';
import { leagueLabel } from '../lib/format.ts';

const MAX_RESULTS = 30;

/** Lower case without accents, so "muller" finds "Müller". */
function fold(text: string) {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

/** Teams and players by name. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const { data: meta } = useMeta();
  const { data: stats } = useStats(null);
  const words = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const matches = (text: string) => {
    const folded = fold(text);
    return words.every((w) => folded.includes(w));
  };
  const league = (id: number) => leagueLabel(meta?.leagues.find((l) => l.id === id)?.short ?? '');
  const teams = words.length ? (meta?.teams ?? []).filter((t) => matches(t.name)) : [];
  const players = words.length ? (stats?.players ?? []).filter((p) => matches(p.name)).sort((a, b) => b.goals - a.goals) : [];
  const row = 'flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-(--color-surface-2)';

  return (
    <div className="mx-auto max-w-2xl">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        placeholder="Team oder Spieler suchen"
        aria-label="Team oder Spieler suchen"
        className="mb-4 w-full rounded-xl border border-(--color-line) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-brand)"
      />
      {!words.length ? (
        <Empty>Gib einen Namen ein – gesucht wird in allen Teams und Spielern der Saison.</Empty>
      ) : !teams.length && !players.length ? (
        <Empty>{stats ? `Nichts gefunden für „${query}“.` : 'Suche …'}</Empty>
      ) : (
        <>
          {teams.length > 0 && (
            <Section title="Teams">
              <div className="card divide-y divide-(--color-line) overflow-hidden">
                {teams.slice(0, MAX_RESULTS).map((t) => (
                  <Link key={t.id} to={`/team/${t.id}`} className={row}>
                    <TeamLogo teamId={t.id} name={t.name} size={26} />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                    <span className="shrink-0 text-xs text-(--color-ink-3)">{league(t.leagueId)}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
          {players.length > 0 && (
            <Section title="Spieler">
              <div className="card divide-y divide-(--color-line) overflow-hidden">
                {players.slice(0, MAX_RESULTS).map((p) => (
                  <Link key={p.key} to={`/spieler/${p.key}`} className={row}>
                    <TeamLogo teamId={p.teamId} name={p.team} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-(--color-ink-3)">{p.team}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-(--color-ink-3)">
                      {p.goals} {p.goals === 1 ? 'Tor' : 'Tore'}
                    </span>
                  </Link>
                ))}
              </div>
              {players.length > MAX_RESULTS && <p className="mt-2 px-1 text-xs text-(--color-ink-3)">Weitere Treffer – gib mehr Buchstaben ein.</p>}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
