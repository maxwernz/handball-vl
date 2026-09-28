// Shape of the handball4all (h4a) JSON service and the pure conversions from it.
// Used by the data pipeline and by the browser, which polls h4a directly for live scores.

import type { Game, GameStatus, TableRow } from './types.ts';

export const H4A_BASE = 'https://spo.handball4all.de';
/** h4a organization id of the Baden-Württembergischer Handball-Verband. */
export const H4A_ORG = 216;

export interface RawGame {
  gID: string;
  sGID: string;
  gNo: string;
  live: boolean;
  gDate: string;
  gTime: string;
  gGymnasiumName: string;
  gGymnasiumPostal: string;
  gGymnasiumTown: string;
  gGymnasiumStreet: string;
  gHomeTeam: string;
  gGuestTeam: string;
  gHomeGoals: string;
  gGuestGoals: string;
  gHomeGoals_1: string;
  gGuestGoals_1: string;
  gHomePoints: string;
  gGuestPoints: string;
  gComment: string;
  robotextstate: string;
}

export interface RawClass {
  gClassID: string;
  gClassSname: string;
  gClassLname: string;
  games: RawGame[];
}

export interface RawScore {
  tabScore: number | '';
  tabTeamID: string;
  tabTeamname: string;
  numPlayedGames: number;
  numWonGames: number;
  numEqualGames: number;
  numLostGames: number;
  numGoalsShot: number;
  numGoalsGot: number;
  pointsPlus: number;
  pointsMinus: number;
}

export interface Envelope<C> {
  menu: {
    period: { list: Record<string, string>; selectedID: string | number };
    dt: { list: Record<string, string>; selected: string | null };
  };
  head: { name: string; sname: string; actualized: string; live: number };
  content: C;
}

export type OrgResponse = Envelope<{ classes: RawClass[] }>;

export type LeagueResponse = Envelope<{
  score: RawScore[];
  scoreComments: string[];
  futureGames: RawClass | [];
  actualGames: RawClass | [];
  teamsList: { teamID: string; teamName: string }[];
}>;

export function leagueUrl(season: number, leagueId: number, teamId?: number) {
  const query = new URLSearchParams({ cmd: 'ps', og: String(H4A_ORG), p: String(season), cl: String(leagueId), ca: teamId ? '0' : '1' });
  if (teamId) query.set('ct', String(teamId));
  return `${H4A_BASE}/service/if_g_json.php?${query}`;
}

export function rawGames(res: LeagueResponse): RawGame[] {
  return Array.isArray(res.content.futureGames) ? [] : res.content.futureGames.games;
}

export const num = (value: string | number | null | undefined) => {
  const text = String(value ?? '').trim();
  return text === '' || Number.isNaN(Number(text)) ? null : Number(text);
};

/** Before kickoff a game counts as "about to start", after this long it can no longer be running. */
export const GAME_WINDOW_BEFORE_MS = 15 * 60_000;
export const GAME_WINDOW_AFTER_MS = 150 * 60_000;
/** A game with a score that started less than this long ago counts as still running. */
const GAME_DURATION_MS = 105 * 60_000;

export function gameStatus(
  g: Pick<Game, 'ts' | 'homeGoals' | 'guestGoals' | 'liveFlag'>,
  now = Date.now(),
): GameStatus {
  const running = now < g.ts + GAME_WINDOW_AFTER_MS;
  if (g.homeGoals === null || g.guestGoals === null) return g.liveFlag && running ? 'live' : 'scheduled';
  if (now < g.ts + GAME_DURATION_MS || (g.liveFlag && running)) return 'live';
  return 'finished';
}

/** Whether a game is running or about to start, i.e. worth polling for. */
export function isActive(g: Game, now = Date.now()) {
  return g.status === 'live' || (g.status === 'scheduled' && now >= g.ts - GAME_WINDOW_BEFORE_MS && now <= g.ts + GAME_WINDOW_AFTER_MS);
}

/** The score-related fields of a game, which change while it is played. */
export function scoreFields(g: RawGame) {
  return {
    homeGoals: num(g.gHomeGoals),
    guestGoals: num(g.gGuestGoals),
    homeGoalsHt: num(g.gHomeGoals_1),
    guestGoalsHt: num(g.gGuestGoals_1),
    homePoints: num(g.gHomePoints),
    guestPoints: num(g.gGuestPoints),
    liveFlag: Boolean(g.live),
  };
}

export function normalizeTable(raw: RawScore[]): TableRow[] {
  let rank = 0;
  return raw.map((row, i) => {
    rank = typeof row.tabScore === 'number' ? row.tabScore : rank || i + 1;
    return {
      rank,
      teamId: Number(row.tabTeamID),
      team: row.tabTeamname,
      played: row.numPlayedGames,
      won: row.numWonGames,
      drawn: row.numEqualGames,
      lost: row.numLostGames,
      goalsFor: row.numGoalsShot,
      goalsAgainst: row.numGoalsGot,
      pointsPlus: row.pointsPlus,
      pointsMinus: row.pointsMinus,
    };
  });
}
