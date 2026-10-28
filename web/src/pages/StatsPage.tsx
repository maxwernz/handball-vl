import { useMemo, useState } from 'react';
import { GENDER_LABEL, leagueGender, splitByGender, useGender, type Gender } from '../lib/gender.ts';
import { useMeta, useStats } from '../api.ts';
import { ReportsNotice } from '../components/ReportsNotice.tsx';
import { LeagueSummaryView } from '../components/LeagueSummary.tsx';
import { PLAYER_VIEWS, PlayerTable, TeamTable, TeamViewChips, type PlayerView, type TeamView } from '../components/StatTables.tsx';
import { Chips, ErrorBox, Loading, Section, StatTile } from '../components/ui.tsx';
import { leagueLabel, perGame } from '../lib/format.ts';

export function StatsPage() {
  const { data: meta } = useMeta();
  const gender = useGender();
  // Never all leagues at once: men's and women's rankings are separate. Follows the header choice until a league is picked.
  const [picked, setPicked] = useState<{ value: number | Gender; for: typeof gender } | null>(null);
  const league: number | Gender = picked && picked.for === gender ? picked.value : gender === 'F' ? 'F' : 'M';
  const setLeague = (value: number | Gender) => setPicked({ value, for: gender });
  const aggregate = typeof league !== 'number';
  const [playerView, setPlayerView] = useState<PlayerView>('goals');
  const [teamView, setTeamView] = useState<TeamView>('attack');
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useStats(league);

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
      <div className="page-heading"><div><p className="page-eyebrow">Teams & Spieler</p><h1 className="page-title">Statistik</h1><p className="page-subtitle">Torschützen, Mannschaften und die Zahlen hinter den Ergebnissen.</p></div></div>
      <label className="mb-5 block max-w-md text-xs font-semibold">Wettbewerb
        <select className="field mt-2" value={league} onChange={(event) => setLeague(event.target.value === 'M' || event.target.value === 'F' ? event.target.value : Number(event.target.value))}>
          {splitByGender(meta?.leagues ?? [], leagueGender).map((section) => section.gender && (
            <optgroup key={section.gender} label={GENDER_LABEL[section.gender]}>
              <option value={section.gender}>Alle {GENDER_LABEL[section.gender]}-Ligen</option>
              {section.items.map((ref) => <option key={ref.id} value={ref.id}>{ref.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <ReportsNotice leagueId={league} />
      {isLoading ? (
        <Loading />
      ) : !data ? (
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
                aria-label="Spieler oder Team in der Statistik suchen"
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
            <PlayerTable players={players} view={playerView} leagues={aggregate ? meta?.leagues : undefined} limit={25} />
          </Section>
          <Section title="Mannschaften">
            <TeamViewChips value={teamView} onChange={setTeamView} />
            <TeamTable teams={data.teams} view={teamView} leagues={aggregate ? meta?.leagues : undefined} />
          </Section>
        </>
      )}
    </div>
  );
}
