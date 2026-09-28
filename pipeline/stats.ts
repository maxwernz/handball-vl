// Season statistics for players and teams, aggregated from results and match reports.

import type {
  Game,
  League,
  MatchEvent,
  PlayerDetail,
  PlayerGame,
  PlayerStats,
  Report,
  TeamSheet,
  TeamStats,
} from '../shared/types.ts';
import { playerKey } from '../shared/players.ts';
import { read } from './store.ts';
import { keys, loadLeagues } from './sync.ts';

export interface SeasonData {
  leagues: League[];
  games: Game[];
  reports: Map<number, Report>;
  players: Map<string, PlayerDetail>;
  teams: Map<number, TeamStats>;
}

const PERIODS = 6;

function periodOf(event: MatchEvent) {
  return Math.min(PERIODS - 1, Math.floor(event.t / 600));
}

function emptyTeam(teamId: number, team: string, leagueId: number): TeamStats {
  return {
    teamId,
    team,
    leagueId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    home: { won: 0, drawn: 0, lost: 0 },
    away: { won: 0, drawn: 0, lost: 0 },
    form: [],
    leadAtHalf: 0,
    comebacks: 0,
    biggestWin: null,
    biggestLoss: null,
    sevenGoals: 0,
    sevenAttempts: 0,
    twoMinutes: 0,
    warnings: 0,
    disqualifications: 0,
    timeouts: 0,
    avgSpectators: null,
    goalsForByPeriod: Array(PERIODS).fill(0),
    goalsAgainstByPeriod: Array(PERIODS).fill(0),
    reports: 0,
  };
}

function addResult(stats: TeamStats, game: Game, home: boolean) {
  const own = home ? game.homeGoals! : game.guestGoals!;
  const other = home ? game.guestGoals! : game.homeGoals!;
  const ownHt = home ? game.homeGoalsHt : game.guestGoalsHt;
  const otherHt = home ? game.guestGoalsHt : game.homeGoalsHt;
  const outcome: 'W' | 'D' | 'L' = own > other ? 'W' : own < other ? 'L' : 'D';
  const split = home ? stats.home : stats.away;
  stats.played++;
  stats.goalsFor += own;
  stats.goalsAgainst += other;
  if (outcome === 'W') (stats.won++, split.won++);
  if (outcome === 'D') (stats.drawn++, split.drawn++);
  if (outcome === 'L') (stats.lost++, split.lost++);
  stats.form = [...stats.form, outcome].slice(-5);
  if (ownHt !== null && otherHt !== null) {
    if (ownHt > otherHt) stats.leadAtHalf++;
    if (ownHt < otherHt && outcome === 'W') stats.comebacks++;
  }
  const diff = own - other;
  const score = `${game.homeGoals}:${game.guestGoals}`;
  if (diff > 0 && (!stats.biggestWin || diff > stats.biggestWin.diff)) stats.biggestWin = { gameId: game.id, diff, score };
  if (diff < 0 && (!stats.biggestLoss || -diff > stats.biggestLoss.diff)) stats.biggestLoss = { gameId: game.id, diff: -diff, score };
}

function addReport(stats: TeamStats, report: Report, side: 'home' | 'guest', spectators: number[]) {
  const sheet = report[side];
  stats.reports++;
  for (const line of [...sheet.players, ...sheet.officials]) {
    stats.sevenGoals += line.sevenGoals;
    stats.sevenAttempts += line.sevenAttempts;
    stats.twoMinutes += line.twoMinutes.length;
    if (line.warning) stats.warnings++;
    if (line.disqualification) stats.disqualifications++;
  }
  for (const event of report.events) {
    if (event.type === 'timeout' && event.side === side) stats.timeouts++;
    if (event.type === 'goal' || event.type === 'sevenGoal') {
      const bucket = event.side === side ? stats.goalsForByPeriod : stats.goalsAgainstByPeriod;
      if (event.side) bucket[periodOf(event)]++;
    }
  }
  if (side === 'home' && report.spectators !== null) spectators.push(report.spectators);
}

function addPlayers(
  players: Map<string, PlayerDetail>,
  report: Report,
  game: Game,
  side: 'home' | 'guest',
  teamId: number,
  team: string,
) {
  const sheet: TeamSheet = report[side];
  const home = side === 'home';
  for (const line of sheet.players) {
    if (line.anonymous) continue;
    const key = playerKey(teamId, line.name);
    const player: PlayerDetail =
      players.get(key) ??
      {
        key,
        name: line.name,
        no: line.no,
        teamId,
        team,
        leagueId: game.leagueId,
        games: 0,
        goals: 0,
        sevenGoals: 0,
        sevenAttempts: 0,
        twoMinutes: 0,
        warnings: 0,
        disqualifications: 0,
        log: [],
        goalsByPeriod: Array(PERIODS).fill(0),
        rankInLeague: null,
      };
    player.no = line.no;
    player.games++;
    player.goals += line.goals;
    player.sevenGoals += line.sevenGoals;
    player.sevenAttempts += line.sevenAttempts;
    player.twoMinutes += line.twoMinutes.length;
    if (line.warning) player.warnings++;
    if (line.disqualification) player.disqualifications++;
    for (const event of report.events) {
      if ((event.type === 'goal' || event.type === 'sevenGoal') && event.side === side && event.player === line.name) {
        player.goalsByPeriod[periodOf(event)]++;
      }
    }
    const entry: PlayerGame = {
      gameId: game.id,
      date: game.date,
      opponent: home ? game.guest : game.home,
      opponentId: home ? game.guestId : game.homeId,
      home,
      result: `${game.homeGoals}:${game.guestGoals}`,
      goals: line.goals,
      sevenGoals: line.sevenGoals,
      sevenAttempts: line.sevenAttempts,
      twoMinutes: line.twoMinutes.length,
      warning: !!line.warning,
      disqualification: !!line.disqualification,
    };
    player.log.push(entry);
    players.set(key, player);
  }
}

const cache = new Map<number, { stamp: string; data: SeasonData }>();

export async function seasonData(season: number): Promise<SeasonData> {
  const leagues = await loadLeagues(season);
  const games = leagues.flatMap((l) => l.games);
  const finished = games.filter((g) => g.status === 'finished');
  const reports = new Map<number, Report>();
  for (const game of finished) {
    const report = await read<Report>(keys.report(game.id));
    if (report) reports.set(game.id, report);
  }
  const stamp = `${leagues.map((l) => l.updatedAt).join()}|${[...reports.values()].map((r) => r.fetchedAt).join()}`;
  const cached = cache.get(season);
  if (cached?.stamp === stamp) return cached.data;

  const teams = new Map<number, TeamStats>();
  const players = new Map<string, PlayerDetail>();
  const spectators = new Map<number, number[]>();
  for (const league of leagues) {
    for (const team of league.teams) {
      teams.set(team.id, emptyTeam(team.id, team.name, league.id));
      spectators.set(team.id, []);
    }
  }
  const teamName = new Map(leagues.flatMap((l) => l.teams.map((t) => [t.id, t.name] as const)));

  for (const game of finished) {
    const report = reports.get(game.id);
    for (const side of ['home', 'guest'] as const) {
      const teamId = side === 'home' ? game.homeId : game.guestId;
      if (teamId === null || !teams.has(teamId)) continue;
      const stats = teams.get(teamId)!;
      addResult(stats, game, side === 'home');
      if (report) {
        addReport(stats, report, side, spectators.get(teamId)!);
        addPlayers(players, report, game, side, teamId, teamName.get(teamId)!);
      }
    }
  }
  for (const [teamId, list] of spectators) {
    if (list.length) teams.get(teamId)!.avgSpectators = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  }
  for (const league of leagues) {
    const ranked = [...players.values()].filter((p) => p.leagueId === league.id).sort((a, b) => b.goals - a.goals);
    ranked.forEach((p, i) => {
      p.rankInLeague = i > 0 && ranked[i - 1].goals === p.goals ? ranked[i - 1].rankInLeague : i + 1;
    });
  }

  const data = { leagues, games, reports, players, teams };
  cache.set(season, { stamp, data });
  return data;
}

export function summarizePlayer({ log, goalsByPeriod, rankInLeague, ...stats }: PlayerDetail): PlayerStats {
  return stats;
}
