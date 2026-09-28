// Data model shared by the server (which produces it) and the web app (which renders it).

export interface Season {
  id: number;
  name: string;
}

export interface LeagueRef {
  id: number;
  short: string;
  name: string;
}

export interface Team {
  id: number;
  name: string;
  /** The abbreviated name h4a uses in schedules and match reports. */
  short: string | null;
}

export interface TableRow {
  rank: number;
  teamId: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  pointsPlus: number;
  pointsMinus: number;
}

export type GameStatus = 'scheduled' | 'live' | 'finished';

export interface Game {
  id: number;
  /** Id of the PDF match report; null until the game has been recorded. */
  reportId: number | null;
  no: string;
  leagueId: number;
  /** Local kickoff in Europe/Berlin, `YYYY-MM-DDTHH:mm`. */
  date: string;
  /** Kickoff as epoch milliseconds. */
  ts: number;
  round: number | null;
  venue: { name: string; town: string; street: string; postal: string } | null;
  home: string;
  guest: string;
  homeId: number | null;
  guestId: number | null;
  homeGoals: number | null;
  guestGoals: number | null;
  homeGoalsHt: number | null;
  guestGoalsHt: number | null;
  homePoints: number | null;
  guestPoints: number | null;
  /** h4a's own "game in progress" flag. */
  liveFlag: boolean;
  /** Derived from the score, the live flag and the kickoff time; recomputed by the web app. */
  status: GameStatus;
  comment: string;
  hasSummary: boolean;
}

export interface League extends LeagueRef {
  season: number;
  updatedAt: string;
  sourceUpdated: string;
  teams: Team[];
  table: TableRow[];
  tableNotes: string[];
  games: Game[];
}

export interface PlayerLine {
  no: string;
  name: string;
  goals: number;
  sevenGoals: number;
  sevenAttempts: number;
  /** Game clock of a yellow card. */
  warning: string | null;
  twoMinutes: string[];
  disqualification: string | null;
  official: boolean;
  /** Player published without a name ("N.N."); shown as "Spieler <no>". */
  anonymous?: boolean;
}

export interface TeamSheet {
  name: string;
  players: PlayerLine[];
  officials: PlayerLine[];
}

export type EventType =
  | 'goal'
  | 'sevenGoal'
  | 'sevenMiss'
  | 'twoMinutes'
  | 'warning'
  | 'disqualification'
  | 'timeout'
  | 'other';

export interface MatchEvent {
  clock: string;
  /** Game time in seconds. */
  t: number;
  type: EventType;
  side: 'home' | 'guest' | null;
  player: string | null;
  no: string | null;
  homeScore: number;
  guestScore: number;
  text: string;
}

export interface Report {
  gameId: number;
  reportId: number;
  fetchedAt: string;
  spectators: number | null;
  referees: string[];
  home: TeamSheet;
  guest: TeamSheet;
  events: MatchEvent[];
}

export interface Summary {
  title: string;
  html: string;
}

export interface PlayerGame {
  gameId: number;
  date: string;
  opponent: string;
  opponentId: number | null;
  home: boolean;
  result: string;
  goals: number;
  sevenGoals: number;
  sevenAttempts: number;
  twoMinutes: number;
  warning: boolean;
  disqualification: boolean;
}

export interface PlayerStats {
  key: string;
  name: string;
  no: string;
  teamId: number;
  team: string;
  leagueId: number;
  games: number;
  goals: number;
  sevenGoals: number;
  sevenAttempts: number;
  twoMinutes: number;
  warnings: number;
  disqualifications: number;
}

export interface PlayerDetail extends PlayerStats {
  log: PlayerGame[];
  /** Goals scored per 10-minute window of the game (6 buckets, overtime folded into the last). */
  goalsByPeriod: number[];
  rankInLeague: number | null;
}

export interface TeamStats {
  teamId: number;
  team: string;
  leagueId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  home: { won: number; drawn: number; lost: number };
  away: { won: number; drawn: number; lost: number };
  form: ('W' | 'D' | 'L')[];
  leadAtHalf: number;
  comebacks: number;
  biggestWin: { gameId: number; diff: number; score: string } | null;
  biggestLoss: { gameId: number; diff: number; score: string } | null;
  sevenGoals: number;
  sevenAttempts: number;
  twoMinutes: number;
  warnings: number;
  disqualifications: number;
  timeouts: number;
  avgSpectators: number | null;
  goalsForByPeriod: number[];
  goalsAgainstByPeriod: number[];
  reports: number;
}

export interface SiteIndex {
  seasons: Season[];
  currentSeason: number;
  updatedAt: string;
}

export interface Meta {
  season: number;
  leagues: LeagueRef[];
  /** Logo file per team id, relative to `api/logos/`; teams without a logo are missing. */
  logos: Record<number, string>;
  /** Whether match reports of this season are still being downloaded. */
  incomplete: boolean;
}

export interface GameDetail {
  game: Game;
  league: LeagueRef;
  report: Report | null;
  summary: Summary | null;
  reportUrl: string | null;
  previous: Game[];
}

export interface TeamDetail {
  team: Team;
  league: LeagueRef;
  tableRow: TableRow | null;
  games: Game[];
  stats: TeamStats;
  players: PlayerStats[];
}

export interface StatsResponse {
  players: PlayerStats[];
  teams: TeamStats[];
  reports: number;
  finished: number;
}
