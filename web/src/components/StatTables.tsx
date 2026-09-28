import { Link } from 'react-router';
import type { LeagueRef, PlayerStats, TeamStats } from '../../../shared/types.ts';
import { leagueLabel, perGame, percent, signed } from '../lib/format.ts';
import { SortableTable, type Column } from './SortableTable.tsx';
import { TeamLogo } from './TeamLogo.tsx';
import { Chips } from './ui.tsx';

function PlayerCell({ p, showTeam }: { p: PlayerStats; showTeam: boolean }) {
  return (
    <Link to={`/spieler/${p.key}`} className="flex min-w-0 items-center gap-2 hover:underline">
      <TeamLogo teamId={p.teamId} name={p.team} size={22} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{p.name}</span>
        {showTeam && <span className="block truncate text-xs font-normal text-(--color-ink-3)">{p.team}</span>}
      </span>
    </Link>
  );
}

export type PlayerView = 'goals' | 'share' | 'seven' | 'penalties';

export const PLAYER_VIEWS: { id: PlayerView; label: string }[] = [
  { id: 'goals', label: 'Torschützen' },
  { id: 'share', label: 'Anteil & Serien' },
  { id: 'seven', label: '7-Meter' },
  { id: 'penalties', label: 'Strafen' },
];

export function PlayerTable({
  players,
  view,
  leagues,
  limit = 20,
  showTeam = true,
}: {
  players: PlayerStats[];
  view: PlayerView;
  leagues?: LeagueRef[];
  limit?: number;
  showTeam?: boolean;
}) {
  const league = (p: PlayerStats) => leagueLabel(leagues?.find((l) => l.id === p.leagueId)?.short ?? '');
  const name: Column<PlayerStats> = {
    id: 'name',
    label: 'Spieler',
    align: 'left',
    grow: true,
    value: (p) => p.name,
    render: (p) => <PlayerCell p={p} showTeam={showTeam} />,
  };
  const leagueCol: Column<PlayerStats>[] = leagues && leagues.length > 1 ? [{ id: 'league', label: 'Liga', align: 'left', hideBelow: 'md', value: league }] : [];
  const games: Column<PlayerStats> = { id: 'games', label: 'Sp', title: 'Spiele', value: (p) => p.games };

  const byView: Record<PlayerView, { columns: Column<PlayerStats>[]; sort: string; filter?: (p: PlayerStats) => boolean }> = {
    goals: {
      sort: 'goals',
      columns: [
        name,
        ...leagueCol,
        games,
        { id: 'goals', label: 'Tore', value: (p) => p.goals },
        { id: 'avg', label: 'Ø', title: 'Tore pro Spiel', value: (p) => (p.games ? p.goals / p.games : 0), render: (p) => perGame(p.goals, p.games) },
        { id: 'field', label: 'Feld', title: 'Feldtore', hideBelow: 'sm', value: (p) => p.goals - p.sevenGoals },
        { id: 'seven', label: '7m', title: '7-Meter-Tore', hideBelow: 'sm', value: (p) => p.sevenGoals },
      ],
    },
    share: {
      sort: 'share',
      filter: (p) => p.goals > 0,
      columns: [
        name,
        ...leagueCol,
        games,
        { id: 'goals', label: 'Tore', hideBelow: 'sm', value: (p) => p.goals },
        {
          id: 'share',
          label: 'Anteil',
          title: 'Anteil an den Toren der Mannschaft in den Spielen, in denen der Spieler dabei war',
          value: (p) => (p.teamGoals ? p.goals / p.teamGoals : 0),
          render: (p) => percent(p.goals, p.teamGoals),
        },
        { id: 'best', label: 'Bestwert', title: 'Meiste Tore in einem Spiel', value: (p) => p.bestGame?.goals ?? 0 },
        { id: 'streak', label: 'Serie', title: 'Meiste Spiele in Folge mit Tor', value: (p) => p.longestStreak },
      ],
    },
    seven: {
      sort: 'made',
      filter: (p) => p.sevenAttempts > 0,
      columns: [
        name,
        ...leagueCol,
        { id: 'made', label: 'Tore', title: '7-Meter-Tore', value: (p) => p.sevenGoals },
        { id: 'att', label: 'Vers.', title: '7-Meter-Versuche', value: (p) => p.sevenAttempts },
        {
          id: 'rate',
          label: 'Quote',
          value: (p) => (p.sevenAttempts ? p.sevenGoals / p.sevenAttempts : 0),
          render: (p) => percent(p.sevenGoals, p.sevenAttempts),
        },
      ],
    },
    penalties: {
      sort: 'two',
      filter: (p) => p.twoMinutes + p.warnings + p.disqualifications > 0,
      columns: [
        name,
        ...leagueCol,
        games,
        { id: 'two', label: '2 Min', title: 'Zeitstrafen', value: (p) => p.twoMinutes },
        { id: 'warn', label: 'Gelb', title: 'Verwarnungen', value: (p) => p.warnings },
        { id: 'disq', label: 'Rot', title: 'Disqualifikationen', value: (p) => p.disqualifications },
      ],
    },
  };
  const config = byView[view];
  const rows = config.filter ? players.filter(config.filter) : players;
  return <SortableTable key={view} rows={rows} columns={config.columns} initialSort={config.sort} rowKey={(p) => p.key} limit={limit} />;
}

export type TeamView = 'attack' | 'games' | 'flow' | 'numbers' | 'discipline';

export function TeamViewChips({ value, onChange }: { value: TeamView; onChange: (v: TeamView) => void }) {
  return (
    <Chips
      options={[
        { id: 'attack' as TeamView, label: 'Tore' },
        { id: 'games' as TeamView, label: 'Bilanz' },
        { id: 'flow' as TeamView, label: 'Spielverlauf' },
        { id: 'numbers' as TeamView, label: 'Über-/Unterzahl' },
        { id: 'discipline' as TeamView, label: 'Disziplin' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

const STREAK = { W: 'S', D: 'U', L: 'N' };
const record = (r: { won: number; drawn: number; lost: number }) => `${r.won}-${r.drawn}-${r.lost}`;

export function TeamTable({ teams, view, leagues }: { teams: TeamStats[]; view: TeamView; leagues?: LeagueRef[] }) {
  const name: Column<TeamStats> = {
    id: 'team',
    label: 'Mannschaft',
    align: 'left',
    grow: true,
    value: (t) => t.team,
    render: (t) => (
      <Link to={`/team/${t.teamId}`} className="flex min-w-0 items-center gap-2 hover:underline">
        <TeamLogo teamId={t.teamId} name={t.team} size={22} />
        <span className="truncate font-medium">{t.team}</span>
      </Link>
    ),
  };
  const leagueCol: Column<TeamStats>[] =
    leagues && leagues.length > 1
      ? [{ id: 'league', label: 'Liga', align: 'left', hideBelow: 'md', value: (t) => leagueLabel(leagues.find((l) => l.id === t.leagueId)?.short ?? '') }]
      : [];
  const avg = (v: number, g: number) => (g ? v / g : 0);
  const views: Record<TeamView, { columns: Column<TeamStats>[]; sort: string }> = {
    attack: {
      sort: 'for',
      columns: [
        name,
        ...leagueCol,
        { id: 'played', label: 'Sp', value: (t) => t.played },
        { id: 'for', label: 'Tore Ø', title: 'Tore pro Spiel', value: (t) => avg(t.goalsFor, t.played), render: (t) => perGame(t.goalsFor, t.played) },
        { id: 'against', label: 'Gegen Ø', title: 'Gegentore pro Spiel', value: (t) => -avg(t.goalsAgainst, t.played), render: (t) => perGame(t.goalsAgainst, t.played) },
        { id: 'seven', label: '7m', title: '7-Meter-Quote', hideBelow: 'sm', value: (t) => avg(t.sevenGoals, t.sevenAttempts), render: (t) => percent(t.sevenGoals, t.sevenAttempts) },
        { id: 'fans', label: 'Zusch. Ø', title: 'Zuschauer pro Heimspiel', hideBelow: 'sm', value: (t) => t.avgSpectators ?? 0, render: (t) => t.avgSpectators ?? '–' },
      ],
    },
    discipline: {
      sort: 'two',
      columns: [
        name,
        ...leagueCol,
        { id: 'played', label: 'Sp', value: (t) => t.played },
        { id: 'two', label: '2 Min', title: 'Zeitstrafen', value: (t) => t.twoMinutes },
        { id: 'twoavg', label: 'Ø', title: 'Zeitstrafen pro Spiel', value: (t) => avg(t.twoMinutes, t.reports), render: (t) => perGame(t.twoMinutes, t.reports) },
        { id: 'warn', label: 'Gelb', value: (t) => t.warnings },
        { id: 'disq', label: 'Rot', value: (t) => t.disqualifications },
        { id: 'to', label: 'Auszeiten', hideBelow: 'sm', value: (t) => t.timeouts },
      ],
    },
    games: {
      sort: 'home',
      columns: [
        name,
        ...leagueCol,
        { id: 'home', label: 'Heim', title: 'Heimbilanz S-U-N', value: (t) => t.home.won * 2 + t.home.drawn, render: (t) => record(t.home) },
        { id: 'away', label: 'Auswärts', title: 'Auswärtsbilanz S-U-N', value: (t) => t.away.won * 2 + t.away.drawn, render: (t) => record(t.away) },
        { id: 'close', label: 'Knapp', title: 'Bilanz in Spielen mit höchstens 2 Toren Unterschied (S-U-N)', value: (t) => t.close.won * 2 + t.close.drawn, render: (t) => record(t.close) },
        {
          id: 'streak',
          label: 'Serie',
          title: 'Aktuelle Serie (S = Siege, U = Unentschieden, N = Niederlagen)',
          hideBelow: 'sm',
          value: (t) => (t.streak ? (t.streak.type === 'W' ? 1 : t.streak.type === 'D' ? 0 : -1) * t.streak.length : 0),
          render: (t) => (t.streak ? `${t.streak.length}× ${STREAK[t.streak.type]}` : '–'),
        },
      ],
    },
    flow: {
      sort: 'lead',
      columns: [
        name,
        ...leagueCol,
        { id: 'lead', label: 'Führung', title: 'Anteil der Spielzeit in Führung (aus Spielberichten)', value: (t) => avg(t.timeLeading, t.timeTotal), render: (t) => percent(t.timeLeading, t.timeTotal) },
        { id: 'behind', label: 'Rückst.', title: 'Anteil der Spielzeit im Rückstand', hideBelow: 'sm', value: (t) => -avg(t.timeTrailing, t.timeTotal), render: (t) => percent(t.timeTrailing, t.timeTotal) },
        { id: 'ht', label: 'HZ-Führ.', title: 'Zur Halbzeit geführt', value: (t) => t.leadAtHalf },
        { id: 'lost', label: 'Verspielt', title: 'Zur Halbzeit geführt und nicht gewonnen', value: (t) => -t.leadLost, render: (t) => t.leadLost },
        { id: 'cb', label: 'Comebacks', title: 'Siege nach Halbzeitrückstand', value: (t) => t.comebacks },
        {
          id: 'end',
          label: 'Schluss',
          title: 'Tordifferenz in den letzten 10 Minuten',
          hideBelow: 'sm',
          value: (t) => t.goalsForByPeriod[5] - t.goalsAgainstByPeriod[5],
          render: (t) => signed(t.goalsForByPeriod[5] - t.goalsAgainstByPeriod[5]),
        },
      ],
    },
    numbers: {
      sort: 'ppdiff',
      columns: [
        name,
        ...leagueCol,
        { id: 'ppfor', label: 'ÜZ Tore', title: 'Tore in Überzahl', value: (t) => t.powerPlay.for },
        { id: 'ppagainst', label: 'ÜZ Geg.', title: 'Gegentore in Überzahl', hideBelow: 'sm', value: (t) => -t.powerPlay.against, render: (t) => t.powerPlay.against },
        { id: 'ppdiff', label: 'ÜZ +/−', title: 'Tordifferenz in Überzahl', value: (t) => t.powerPlay.for - t.powerPlay.against, render: (t) => signed(t.powerPlay.for - t.powerPlay.against) },
        { id: 'shfor', label: 'UZ Tore', title: 'Tore in Unterzahl', hideBelow: 'sm', value: (t) => t.shortHanded.for },
        { id: 'shagainst', label: 'UZ Geg.', title: 'Gegentore in Unterzahl', hideBelow: 'sm', value: (t) => -t.shortHanded.against, render: (t) => t.shortHanded.against },
        { id: 'shdiff', label: 'UZ +/−', title: 'Tordifferenz in Unterzahl', value: (t) => t.shortHanded.for - t.shortHanded.against, render: (t) => signed(t.shortHanded.for - t.shortHanded.against) },
      ],
    },
  };
  return <SortableTable key={view} rows={teams} columns={views[view].columns} initialSort={views[view].sort} rowKey={(t) => t.teamId} />;
}
