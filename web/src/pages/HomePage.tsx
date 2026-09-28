import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Game, League, LeagueRef, Meta } from '../../../shared/types.ts';
import { useGames, useLeague, useMeta } from '../api.ts';
import { GameList } from '../components/GameRow.tsx';
import { StandingsTable } from '../components/StandingsTable.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Chips, Empty, ErrorBox, FormBadges, Loading, Section, TextLink } from '../components/ui.tsx';
import {
  setFavorites,
  shareLink,
  toggleFavorite,
  toggleFavoriteLeague,
  useFavoriteLeagues,
  useFavorites,
  useFavoriteTeamIds,
} from '../lib/favorites.ts';
import { formatDay, formatTime, isoDay, leagueLabel, relativeDay } from '../lib/format.ts';
import { formOf } from '../lib/standings.ts';
import { storage } from '../lib/storage.ts';

function mondayOf(offsetWeeks: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d;
}

type GameFilter = 'mine' | 'all';

function WeekGames({ leagues, mine }: { leagues: LeagueRef[]; mine: ((g: Game) => boolean) | null }) {
  const [offset, setOffset] = useState(0);
  const [filter, setFilterState] = useState<GameFilter>(() => (storage.get('gameFilter') === 'all' ? 'all' : 'mine'));
  const setFilter = (f: GameFilter) => {
    storage.set('gameFilter', f);
    setFilterState(f);
  };
  const start = mondayOf(offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const { data: games, isLoading, error } = useGames(start.toISOString(), end.toISOString());
  const tag = useMemo(() => {
    const byId = new Map(leagues.map((l) => [l.id, leagueLabel(l.short)]));
    return (g: Game) => byId.get(g.leagueId) ?? '';
  }, [leagues]);
  const onlyMine = mine !== null && filter === 'mine';

  const byDay = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of games ?? []) {
      if (onlyMine && !mine!(g)) continue;
      map.set(isoDay(g.date), [...(map.get(isoDay(g.date)) ?? []), g]);
    }
    return [...map];
  }, [games, onlyMine, mine]);

  const title = offset === 0 ? 'Diese Woche' : offset === -1 ? 'Letzte Woche' : offset === 1 ? 'Nächste Woche' : `Woche ab ${formatDay(start.toISOString().slice(0, 10))}`;
  const arrow = 'rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-1.5 text-sm hover:bg-(--color-surface-2)';

  return (
    <Section
      title={title}
      action={
        <div className="flex gap-1.5">
          <button className={arrow} onClick={() => setOffset((o) => o - 1)} aria-label="Vorherige Woche">
            ←
          </button>
          {offset !== 0 && (
            <button className={arrow} onClick={() => setOffset(0)}>
              Heute
            </button>
          )}
          <button className={arrow} onClick={() => setOffset((o) => o + 1)} aria-label="Nächste Woche">
            →
          </button>
        </div>
      }
    >
      {mine && (
        <Chips
          options={[
            { id: 'mine' as GameFilter, label: 'Meine Spiele' },
            { id: 'all' as GameFilter, label: 'Alle Spiele' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      )}
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : byDay.length === 0 ? (
        <Empty>
          {onlyMine && games?.length ? (
            <>
              Diese Woche spielen deine Teams und Ligen nicht.{' '}
              <button className="font-medium text-(--color-brand) hover:underline" onClick={() => setFilter('all')}>
                Alle Spiele zeigen
              </button>
            </>
          ) : (
            'In dieser Woche finden keine Spiele statt.'
          )}
        </Empty>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, list]) => (
            <div key={day}>
              <div className="mb-1.5 px-1 text-sm font-semibold">{relativeDay(list[0].date)}</div>
              <GameList games={list} showDate={false} leagueTag={tag} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function FavoriteCard({ league, team }: { league: League; team: string }) {
  const t = league.teams.find((x) => x.name === team)!;
  const row = league.table.find((r) => r.teamId === t.id);
  const games = league.games.filter((g) => g.homeId === t.id || g.guestId === t.id);
  const last = games.filter((g) => g.status === 'finished').at(-1);
  const next = games.find((g) => g.status !== 'finished');
  const opponent = (g: Game) => (g.homeId === t.id ? `vs. ${g.guest}` : `@ ${g.home}`);
  return (
    <Link to={`/team/${t.id}`} className="card block p-4 transition hover:border-(--color-brand)">
      <div className="flex items-center gap-3">
        <TeamLogo teamId={t.id} name={t.name} size={44} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{t.name}</div>
          <div className="text-sm text-(--color-ink-2)">
            {leagueLabel(league.short)} · Platz {row?.rank ?? '–'} · {row?.pointsPlus ?? 0}:{row?.pointsMinus ?? 0} Punkte
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-(--color-ink-3)">Letztes Spiel</div>
          {last ? (
            <div className="truncate">
              <span className="tabular font-semibold">
                {last.homeGoals}:{last.guestGoals}
              </span>{' '}
              {opponent(last)}
            </div>
          ) : (
            '–'
          )}
        </div>
        <div>
          <div className="text-xs text-(--color-ink-3)">Nächstes Spiel</div>
          {next ? (
            <div className="truncate">
              {next.status === 'live' ? 'LIVE' : `${formatDay(next.date)} ${formatTime(next.date)}`} {opponent(next)}
            </div>
          ) : (
            '–'
          )}
        </div>
      </div>
      <div className="mt-3">
        <FormBadges form={formOf(league.games, t.id)} />
      </div>
    </Link>
  );
}

function FavoriteCards({ league: ref, favorites }: { league: LeagueRef; favorites: string[] }) {
  const { data: league } = useLeague(ref.id);
  if (!league) return <div className="card h-36 animate-pulse" />;
  return (
    <>
      {league.teams
        .filter((t) => favorites.includes(t.name))
        .map((t) => (
          <FavoriteCard key={t.id} league={league} team={t.name} />
        ))}
    </>
  );
}

function LeagueOverview({ league: ref, full }: { league: LeagueRef; full: boolean }) {
  const { data: league } = useLeague(ref.id);
  if (!league) return <div className="card h-64 animate-pulse" />;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <Link to={`/liga/${league.id}`} className="font-semibold hover:underline">
          {league.name}
        </Link>
        <TextLink to={`/liga/${league.id}`}>{full ? 'Details →' : 'Tabelle →'}</TextLink>
      </div>
      <StandingsTable league={league} rows={full ? league.table : league.table.slice(0, 5)} compact />
    </div>
  );
}

const pill = (on: boolean) =>
  `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-(--color-brand) bg-(--color-brand) text-white' : 'border-(--color-line) bg-(--color-surface) text-(--color-ink-2) hover:text-(--color-ink)'}`;

/** Pick favorite leagues and teams; shown on first visit and via "Favoriten bearbeiten". */
function FavoritesSetup({ meta, onDone }: { meta: Meta; onDone: () => void }) {
  const favorites = useFavorites();
  const favoriteLeagues = useFavoriteLeagues();
  const chosen = meta.leagues.filter((l) => favoriteLeagues.includes(l.short));
  const shown = chosen.length ? chosen : meta.leagues;
  return (
    <div className="card mb-6 p-4">
      <h2 className="text-lg font-bold">Deine Startseite</h2>
      <p className="mt-1 text-sm text-(--color-ink-2)">
        Wähle deine Ligen und Teams – sie erscheinen dann hier oben, und „Meine Spiele“ zeigt nur ihre Spiele. Die Auswahl wird nur auf diesem Gerät gespeichert.
      </p>
      <h3 className="mt-4 mb-2 text-sm font-semibold">Ligen</h3>
      <div className="flex flex-wrap gap-2">
        {meta.leagues.map((l) => (
          <button key={l.id} className={pill(favoriteLeagues.includes(l.short))} aria-pressed={favoriteLeagues.includes(l.short)} onClick={() => toggleFavoriteLeague(l.short)}>
            {l.name}
          </button>
        ))}
      </div>
      <h3 className="mt-4 mb-2 text-sm font-semibold">Teams</h3>
      <div className="space-y-3">
        {shown.map((l) => (
          <div key={l.id}>
            {shown.length > 1 && <div className="mb-1.5 text-xs text-(--color-ink-3)">{l.name}</div>}
            <div className="flex flex-wrap gap-2">
              {(meta.teams ?? [])
                .filter((t) => t.leagueId === l.id)
                .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map((t) => (
                  <button key={t.id} className={pill(favorites.includes(t.name))} aria-pressed={favorites.includes(t.name)} onClick={() => toggleFavorite(t.name)}>
                    <TeamLogo teamId={t.id} name={t.name} size={18} />
                    {t.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="rounded-lg bg-(--color-brand) px-4 py-2 text-sm font-semibold text-white hover:opacity-90" onClick={onDone}>
          Fertig
        </button>
      </div>
    </div>
  );
}

/** Offers to take over favorites from a shared link (?team=…&liga=…). */
function ImportBanner({ onImported }: { onImported: () => void }) {
  const [params, setParams] = useSearchParams();
  const teams = params.getAll('team');
  const leagues = params.getAll('liga');
  if (!teams.length && !leagues.length) return null;
  const parts = [teams.length && `${teams.length} ${teams.length === 1 ? 'Team' : 'Teams'}`, leagues.length && `${leagues.length} ${leagues.length === 1 ? 'Liga' : 'Ligen'}`].filter(Boolean);
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 border-(--color-brand) p-4 text-sm">
      <span className="w-full sm:w-auto sm:flex-1">Favoriten aus dem Link übernehmen ({parts.join(', ')})? Deine bisherige Auswahl wird ersetzt.</span>
      <button className="ml-auto rounded-lg px-3 py-1.5 text-(--color-ink-2) hover:bg-(--color-surface-2)" onClick={() => setParams({}, { replace: true })}>
        Nein
      </button>
      <button
        className="rounded-lg bg-(--color-brand) px-3 py-1.5 font-semibold text-white hover:opacity-90"
        onClick={() => {
          setFavorites(teams, leagues);
          storage.set('setupDone', '1');
          setParams({}, { replace: true });
          onImported();
        }}
      >
        Übernehmen
      </button>
    </div>
  );
}

function ShareButton({ teams, leagues }: { teams: string[]; leagues: string[] }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = shareLink(teams, leagues);
    try {
      if (navigator.share) await navigator.share({ title: 'Meine Handball-Favoriten', url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <button className="text-sm font-medium text-(--color-brand) hover:underline" onClick={share}>
      {copied ? 'Link kopiert ✓' : 'Auf anderes Gerät übertragen'}
    </button>
  );
}

export function HomePage() {
  const { data: meta, isLoading, error } = useMeta();
  const favorites = useFavorites();
  const favoriteLeagues = useFavoriteLeagues();
  const favoriteIds = useFavoriteTeamIds();
  // Decided once, so the setup stays open while favorites are being picked.
  const [editing, setEditing] = useState(() => storage.get('setupDone') !== '1' && !favorites.length && !favoriteLeagues.length);

  const myLeagues = useMemo(() => (meta?.leagues ?? []).filter((l) => favoriteLeagues.includes(l.short)), [meta, favoriteLeagues]);
  const mine = useMemo(() => {
    if (!favoriteIds.size && !myLeagues.length) return null;
    const leagueIds = new Set(myLeagues.map((l) => l.id));
    return (g: Game) => leagueIds.has(g.leagueId) || favoriteIds.has(g.homeId ?? -1) || favoriteIds.has(g.guestId ?? -1);
  }, [favoriteIds, myLeagues]);

  if (isLoading) return <Loading />;
  if (error || !meta) return <ErrorBox error={error} />;
  if (!meta.leagues.length) return <Empty>Noch keine Ligen geladen – der Server synchronisiert gerade.</Empty>;

  const hasFavorites = favoriteIds.size > 0 || myLeagues.length > 0;
  const showSetup = editing;
  const teamLeagues = meta.leagues.filter((l) => (meta.teams ?? []).some((t) => t.leagueId === l.id && favoriteIds.has(t.id)));
  const otherLeagues = meta.leagues.filter((l) => !myLeagues.includes(l));
  const edit = () => {
    setEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <ImportBanner onImported={() => setEditing(false)} />
      {showSetup && (
        <FavoritesSetup
          meta={meta}
          onDone={() => {
            storage.set('setupDone', '1');
            setEditing(false);
          }}
        />
      )}
      <div className="grid gap-x-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0">
          <WeekGames leagues={meta.leagues} mine={mine} />
        </div>
        <div className="min-w-0">
          {teamLeagues.length > 0 && (
            <Section title="Meine Teams">
              <div className="space-y-3">
                {teamLeagues.map((l) => (
                  <FavoriteCards key={l.id} league={l} favorites={favorites} />
                ))}
              </div>
            </Section>
          )}
          <Section title={myLeagues.length ? (myLeagues.length > 1 ? 'Meine Ligen' : 'Meine Liga') : 'Ligen'}>
            {!hasFavorites && !showSetup && (
              <div className="mb-3 rounded-xl bg-(--color-brand)/10 px-3 py-2 text-sm text-(--color-ink-2)">
                Tipp: Lege deine Teams und Ligen fest, dann stehen sie hier ganz oben.{' '}
                <button className="font-medium text-(--color-brand) hover:underline" onClick={edit}>
                  Jetzt auswählen
                </button>
              </div>
            )}
            <div className="space-y-5">
              {(myLeagues.length ? myLeagues : meta.leagues).map((l) => (
                <LeagueOverview key={l.id} league={l} full={myLeagues.length > 0} />
              ))}
            </div>
          </Section>
          {myLeagues.length > 0 && otherLeagues.length > 0 && (
            <Section title="Weitere Ligen">
              <div className="card divide-y divide-(--color-line) overflow-hidden">
                {otherLeagues.map((l) => (
                  <Link key={l.id} to={`/liga/${l.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-(--color-surface-2)">
                    {l.name}
                    <span className="text-(--color-ink-3)">→</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
          {hasFavorites && !showSetup && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <button className="text-sm font-medium text-(--color-brand) hover:underline" onClick={edit}>
                Favoriten bearbeiten
              </button>
              <ShareButton teams={favorites} leagues={favoriteLeagues} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
