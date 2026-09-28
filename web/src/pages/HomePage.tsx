import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Game, League, LeagueRef } from '../../../shared/types.ts';
import { useGames, useLeague, useMeta } from '../api.ts';
import { GameList } from '../components/GameRow.tsx';
import { StandingsTable } from '../components/StandingsTable.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Empty, ErrorBox, FormBadges, Loading, Section, TextLink } from '../components/ui.tsx';
import { useFavorites } from '../lib/favorites.ts';
import { formatDay, formatTime, isoDay, leagueLabel, relativeDay } from '../lib/format.ts';
import { formOf } from '../lib/standings.ts';

function mondayOf(offsetWeeks: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d;
}

function WeekGames({ leagues }: { leagues: LeagueRef[] }) {
  const [offset, setOffset] = useState(0);
  const start = mondayOf(offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const { data: games, isLoading, error } = useGames(start.toISOString(), end.toISOString());
  const tag = useMemo(() => {
    const byId = new Map(leagues.map((l) => [l.id, leagueLabel(l.short)]));
    return (g: Game) => byId.get(g.leagueId) ?? '';
  }, [leagues]);

  const byDay = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of games ?? []) map.set(isoDay(g.date), [...(map.get(isoDay(g.date)) ?? []), g]);
    return [...map];
  }, [games]);

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
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : byDay.length === 0 ? (
        <Empty>In dieser Woche finden keine Spiele statt.</Empty>
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

function LeagueOverview({ league: ref, favorites }: { league: LeagueRef; favorites: string[] }) {
  const { data: league } = useLeague(ref.id);
  if (!league) return <div className="card h-64 animate-pulse" />;
  const favs = league.teams.filter((t) => favorites.includes(t.name));
  return (
    <div>
      {favs.map((t) => (
        <div key={t.id} className="mb-3">
          <FavoriteCard league={league} team={t.name} />
        </div>
      ))}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <Link to={`/liga/${league.id}`} className="font-semibold hover:underline">
          {league.name}
        </Link>
        <TextLink to={`/liga/${league.id}`}>Tabelle →</TextLink>
      </div>
      <StandingsTable league={league} rows={league.table.slice(0, 5)} compact />
    </div>
  );
}

export function HomePage() {
  const { data: meta, isLoading, error } = useMeta();
  const favorites = useFavorites();
  if (isLoading) return <Loading />;
  if (error || !meta) return <ErrorBox error={error} />;
  if (!meta.leagues.length) return <Empty>Noch keine Ligen geladen – der Server synchronisiert gerade.</Empty>;

  return (
    <div className="grid gap-x-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="min-w-0">
        <WeekGames leagues={meta.leagues} />
      </div>
      <div className="min-w-0">
        <Section title={favorites.length ? 'Meine Teams & Ligen' : 'Ligen'}>
          {!favorites.length && (
            <div className="mb-3 rounded-xl bg-(--color-brand)/10 px-3 py-2 text-sm text-(--color-ink-2)">
              Tipp: Markiere dein Team auf seiner Teamseite mit ☆, dann erscheint es hier ganz oben.
            </div>
          )}
          <div className="space-y-5">
            {meta.leagues.map((l) => (
              <LeagueOverview key={l.id} league={l} favorites={favorites} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
