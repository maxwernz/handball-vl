import { useMemo, useState } from 'react';
import { useMeta, useStats } from '../api.ts';
import { LeagueSummaryView } from '../components/LeagueSummary.tsx';
import { PLAYER_VIEWS, PlayerTable, TeamTable, TeamViewChips, type PlayerView, type TeamView } from '../components/StatTables.tsx';
import { Chips, ErrorBox, Loading, Section, StatTile } from '../components/ui.tsx';
import { leagueLabel, perGame } from '../lib/format.ts';

export function StatsPage() {
  const { data: meta } = useMeta();
  const [league, setLeague] = useState<number | 'all'>('all');
  const [playerView, setPlayerView] = useState<PlayerView>('goals');
  const [teamView, setTeamView] = useState<TeamView>('attack');
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useStats(league === 'all' ? null : league);

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (data?.players ?? []).filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)) : (data?.players ?? []);
  }, [data, query]);

  const totals = useMemo(() => {
    const teams = data?.teams ?? [];
    const goals = teams.reduce((n, t) => n + t.goalsFor, 0);
    const games = teams.reduce((n, t) => n + t.played, 0) / 2;
    const top = [...(data?.players ?? [])].sort((a, b) => b.goals - a.goals)[0];
    return { goals, games, top };
  }, [data]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Statistik</h1>
      <Chips
        options={[{ id: 'all' as number | 'all', label: 'Alle Ligen' }, ...(meta?.leagues ?? []).map((l) => ({ id: l.id as number | 'all', label: leagueLabel(l.short) }))]}
        value={league}
        onChange={setLeague}
      />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox error={error} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Spiele" value={totals.games} hint={`${data.reports} Spielberichte ausgewertet`} />
            <StatTile label="Tore" value={totals.goals} hint={`Ø ${perGame(totals.goals, totals.games)} pro Spiel`} />
            <StatTile label="Spieler erfasst" value={data.players.length} />
            <StatTile label="Top-Torschütze" value={totals.top?.goals ?? '–'} hint={totals.top ? `${totals.top.name} (${totals.top.team})` : undefined} />
          </div>
          <LeagueSummaryView data={data} />
          <Section title="Spieler">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="search"
                placeholder="Spieler oder Team suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm outline-none focus:border-(--color-brand) sm:w-72"
              />
            </div>
            <Chips
              options={PLAYER_VIEWS}
              value={playerView}
              onChange={setPlayerView}
            />
            <PlayerTable players={players} view={playerView} leagues={league === 'all' ? meta?.leagues : undefined} limit={25} />
          </Section>
          <Section title="Mannschaften">
            <TeamViewChips value={teamView} onChange={setTeamView} />
            <TeamTable teams={data.teams} view={teamView} leagues={league === 'all' ? meta?.leagues : undefined} />
          </Section>
        </>
      )}
    </div>
  );
}
