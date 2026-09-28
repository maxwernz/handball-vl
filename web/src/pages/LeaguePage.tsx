import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { Game, League } from '../../../shared/types.ts';
import { useLeague, useStats } from '../api.ts';
import { RankChart, SERIES_COLORS } from '../components/charts.tsx';
import { GameList } from '../components/GameRow.tsx';
import { LeagueSummaryView } from '../components/LeagueSummary.tsx';
import { StandingsTable } from '../components/StandingsTable.tsx';
import { PLAYER_VIEWS, PlayerTable, TeamTable, TeamViewChips, type PlayerView, type TeamView } from '../components/StatTables.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Chips, Empty, ErrorBox, FavoriteStar, Loading, Section, Tabs } from '../components/ui.tsx';
import { toggleFavoriteLeague, useFavoriteLeagues, useFavorites } from '../lib/favorites.ts';
import { formatDay, isoDay } from '../lib/format.ts';
import { currentRound, rankHistory, tableFor, type TableView } from '../lib/standings.ts';
import { storage } from '../lib/storage.ts';

type Tab = 'table' | 'schedule' | 'history' | 'stats';

function TableTab({ league }: { league: League }) {
  const [view, setView] = useState<TableView>('all');
  const rows = useMemo(() => tableFor(league, view), [league, view]);
  return (
    <>
      <Chips
        options={[
          { id: 'all', label: 'Gesamt' },
          { id: 'home', label: 'Heim' },
          { id: 'away', label: 'Auswärts' },
        ]}
        value={view}
        onChange={setView}
      />
      <StandingsTable league={league} rows={rows} />
      {view === 'all' && league.tableNotes.map((n) => <p key={n} className="mt-2 px-1 text-xs text-(--color-ink-3)">{n}</p>)}
      <p className="mt-1 px-1 text-xs text-(--color-ink-3)">Stand laut h4a: {league.sourceUpdated}</p>
    </>
  );
}

function ScheduleTab({ league }: { league: League }) {
  const rounds = useMemo(() => [...new Set(league.games.map((g) => g.round).filter((r): r is number => r !== null))], [league]);
  const [round, setRound] = useState<number | 'all' | 'other'>(() => currentRound(league.games) ?? 'all');
  const [team, setTeam] = useState<number | 'all'>('all');
  const unassigned = league.games.some((g) => g.round === null);

  let games: Game[] = league.games;
  if (team !== 'all') games = games.filter((g) => g.homeId === team || g.guestId === team);
  else if (round === 'other') games = games.filter((g) => g.round === null);
  else if (round !== 'all') games = games.filter((g) => g.round === round);

  const range = (list: Game[]) => {
    if (!list.length) return '';
    const first = formatDay(list[0].date);
    const last = formatDay(list[list.length - 1].date);
    return isoDay(list[0].date) === isoDay(list[list.length - 1].date) ? first : `${first} – ${last}`;
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Mannschaft filtern"
          value={team}
          onChange={(e) => setTeam(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm"
        >
          <option value="all">Alle Mannschaften</option>
          {[...league.teams].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {team === 'all' && (
        <Chips
          options={[
            ...rounds.map((r) => ({ id: r as number | 'all' | 'other', label: `${r}. Spieltag` })),
            ...(unassigned ? [{ id: 'other' as const, label: 'Nachholspiele' }] : []),
            { id: 'all' as const, label: 'Alle' },
          ]}
          value={round}
          onChange={setRound}
        />
      )}
      {typeof round === 'number' && team === 'all' && <div className="mb-2 px-1 text-sm text-(--color-ink-2)">{range(games)}</div>}
      {games.length ? <GameList games={games} perspective={team === 'all' ? undefined : team} /> : <Empty>Keine Spiele.</Empty>}
    </>
  );
}

const MAX_SELECTED = SERIES_COLORS.length;

function HistoryTab({ league }: { league: League }) {
  const favorites = useFavorites();
  const history = useMemo(() => rankHistory(league), [league]);
  const [selected, setSelected] = useState<number[]>(() => {
    const favs = league.teams.filter((t) => favorites.includes(t.name)).map((t) => t.id);
    return (favs.length ? favs : league.table.slice(0, 3).map((r) => r.teamId)).slice(0, MAX_SELECTED);
  });
  if (!history.rounds.length) return <Empty>Der Tabellenverlauf erscheint nach dem ersten Spieltag.</Empty>;

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_SELECTED ? [...s, id] : [...s.slice(1), id]));
  const order = league.table.length ? league.table.map((r) => r.teamId) : league.teams.map((t) => t.id);
  const name = new Map(league.teams.map((t) => [t.id, t.name]));
  const series = order
    .filter((id) => history.ranks.has(id))
    .map((id) => ({
      id,
      label: name.get(id) ?? '',
      ranks: history.ranks.get(id)!,
      color: selected.includes(id) ? SERIES_COLORS[selected.indexOf(id)] : undefined,
    }));

  return (
    <>
      <div className="card mb-4 p-4">
        <RankChart rounds={history.rounds} teams={league.teams.length} series={series} />
        <p className="mt-2 text-xs text-(--color-ink-3)">
          Platz nach jedem Spieltag. Der aktuelle Platz stammt aus der offiziellen Tabelle, frühere Spieltage sind aus den Ergebnissen nachgerechnet (punktgleiche Teams teilen sich den Platz).
        </p>
      </div>
      <div className="mb-2 px-1 text-sm text-(--color-ink-2)">Teams zum Vergleichen antippen (bis zu {MAX_SELECTED}):</div>
      <div className="flex flex-wrap gap-2">
        {order.map((id) => {
          const on = selected.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'font-semibold' : 'border-(--color-line) bg-(--color-surface) text-(--color-ink-2) hover:text-(--color-ink)'}`}
              style={on ? { borderColor: SERIES_COLORS[selected.indexOf(id)] } : undefined}
            >
              {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[selected.indexOf(id)] }} />}
              <TeamLogo teamId={id} name={name.get(id) ?? ''} size={18} />
              {name.get(id)}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StatsTab({ league }: { league: League }) {
  const { data, isLoading, error } = useStats(league.id);
  const [playerView, setPlayerView] = useState<PlayerView>('goals');
  const [teamView, setTeamView] = useState<TeamView>('attack');
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <>
      <p className="mb-4 px-1 text-xs text-(--color-ink-3)">
        Aus {data.reports} von {data.finished} Spielberichten ausgewertet.
      </p>
      <LeagueSummaryView data={data} />
      <Section title="Spieler">
        <Chips
          options={PLAYER_VIEWS}
          value={playerView}
          onChange={setPlayerView}
        />
        <PlayerTable players={data.players} view={playerView} />
      </Section>
      <Section title="Mannschaften">
        <TeamViewChips value={teamView} onChange={setTeamView} />
        <TeamTable teams={data.teams} view={teamView} />
      </Section>
    </>
  );
}

export function LeaguePage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'table';
  const { data: league, isLoading, error } = useLeague(id);
  const favoriteLeagues = useFavoriteLeagues();

  useEffect(() => storage.set('lastLeague', String(id)), [id]);

  if (isLoading) return <Loading />;
  if (error || !league) return <ErrorBox error={error} />;
  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="mb-0.5 text-xl font-bold">{league.name}</h1>
          <p className="text-sm text-(--color-ink-2)">{league.short}</p>
        </div>
        <FavoriteStar on={favoriteLeagues.includes(league.short)} onClick={() => toggleFavoriteLeague(league.short)} />
      </div>
      <Tabs
        tabs={[
          { id: 'table', label: 'Tabelle' },
          { id: 'schedule', label: 'Spielplan' },
          { id: 'history', label: 'Verlauf' },
          { id: 'stats', label: 'Statistik' },
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'table' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'table' && <TableTab league={league} />}
      {tab === 'schedule' && <ScheduleTab key={league.id} league={league} />}
      {tab === 'history' && <HistoryTab key={league.id} league={league} />}
      {tab === 'stats' && <StatsTab league={league} />}
    </div>
  );
}
