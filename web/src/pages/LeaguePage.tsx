import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { Game, League } from '../../../shared/types.ts';
import { useLeague, useStats } from '../api.ts';
import { GameList } from '../components/GameRow.tsx';
import { StandingsTable } from '../components/StandingsTable.tsx';
import { PlayerTable, TeamTable, type PlayerView, type TeamView } from '../components/StatTables.tsx';
import { Chips, Empty, ErrorBox, Loading, Section, Tabs } from '../components/ui.tsx';
import { formatDay, isoDay } from '../lib/format.ts';
import { currentRound, tableFor, type TableView } from '../lib/standings.ts';
import { storage } from '../lib/storage.ts';

type Tab = 'table' | 'schedule' | 'stats';

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
      <Section title="Spieler">
        <Chips
          options={[
            { id: 'goals', label: 'Torschützen' },
            { id: 'seven', label: '7-Meter' },
            { id: 'penalties', label: 'Strafen' },
          ]}
          value={playerView}
          onChange={setPlayerView}
        />
        <PlayerTable players={data.players} view={playerView} />
      </Section>
      <Section title="Mannschaften">
        <Chips
          options={[
            { id: 'attack', label: 'Tore' },
            { id: 'games', label: 'Bilanz' },
            { id: 'discipline', label: 'Disziplin' },
          ]}
          value={teamView}
          onChange={setTeamView}
        />
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

  useEffect(() => storage.set('lastLeague', String(id)), [id]);

  if (isLoading) return <Loading />;
  if (error || !league) return <ErrorBox error={error} />;
  return (
    <div>
      <h1 className="mb-0.5 text-xl font-bold">{league.name}</h1>
      <p className="mb-4 text-sm text-(--color-ink-2)">{league.short}</p>
      <Tabs
        tabs={[
          { id: 'table', label: 'Tabelle' },
          { id: 'schedule', label: 'Spielplan' },
          { id: 'stats', label: 'Statistik' },
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'table' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'table' && <TableTab league={league} />}
      {tab === 'schedule' && <ScheduleTab key={league.id} league={league} />}
      {tab === 'stats' && <StatsTab league={league} />}
    </div>
  );
}
