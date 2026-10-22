import { Link, useSearchParams } from 'react-router';
import { useMeta, useStats } from '../api.ts';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Empty, ErrorBox, Loading, Section } from '../components/ui.tsx';
import { leagueLabel } from '../lib/format.ts';
import { matcher } from '../lib/search.ts';

const MAX_RESULTS = 30;

/** Teams and players by name. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const { data: meta, error: metaError } = useMeta();
  const { data: stats, error: statsError, isPending } = useStats(null);
  const matches = matcher(query);
  const league = (id: number) => leagueLabel(meta?.leagues.find((l) => l.id === id)?.short ?? '');
  const teams = matches ? (meta?.teams ?? []).filter((t) => matches(t.name)) : [];
  const players = matches ? (stats?.players ?? []).filter((p) => matches(p.name)).sort((a, b) => b.goals - a.goals) : [];
  const row = 'flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-(--color-surface-2)';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="page-heading"><div><p className="page-eyebrow">Alle Wettbewerbe</p><h1 className="page-title">Suche</h1><p className="page-subtitle">Finde dein Team oder Spieler aus den erfassten Spielberichten.</p></div></div>
      <input
        type="search"
        value={query}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        placeholder="Team oder Spieler suchen"
        aria-label="Team oder Spieler suchen"
        className="mb-4 w-full rounded-xl border border-(--color-line) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-brand)"
      />
      {metaError || statsError ? <ErrorBox error={metaError ?? statsError} /> : !matches ? (
        <Empty>Gib einen Namen ein – gesucht wird in allen Teams und Spielern der Saison.</Empty>
      ) : isPending && !teams.length ? <Loading /> : !teams.length && !players.length ? (
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
