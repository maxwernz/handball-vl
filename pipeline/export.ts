// Writes everything the web app reads as static JSON files, laid out like a
// read-only API: api/index.json, api/s/<season>/meta.json, …/league/<id>.json etc.

import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORERS_PER_GAME } from '../shared/types.ts';
import { leagueGender, type Gender } from '../shared/gender.ts';
import type {
  Game,
  GameDetail,
  GameScorer,
  GameRecord,
  LeagueRef,
  LeagueSummary,
  Meta,
  SiteIndex,
  StatsResponse,
  Summary,
  TeamDetail,
} from '../shared/types.ts';
import { config } from './config.ts';
import { reportUrl } from './h4a.ts';
import { logoColor, logoFor } from './logos.ts';
import { seasonData, summarizePlayer, type SeasonData } from './stats.ts';
import { exists, filePath, read } from './store.ts';
import { keys, type SeasonIndex } from './sync.ts';

const toRef = ({ id, short, name }: LeagueRef): LeagueRef => ({ id, short, name });
let exportDir = config.outDir;
let allowLogoLookups = true;

async function emit(relative: string, value: unknown) {
  const file = path.join(exportDir, `${relative}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}

function record(game: Game, value: number): GameRecord {
  return { gameId: game.id, home: game.home, guest: game.guest, score: `${game.homeGoals}:${game.guestGoals}`, value };
}

function summary(data: SeasonData, finished: Game[], inLeague: (l: number) => boolean): LeagueSummary {
  const result: LeagueSummary = { homeWins: 0, draws: 0, awayWins: 0, avgSpectators: null, biggestWin: null, mostGoals: null, topPlayerGame: null };
  const spectators: number[] = [];
  for (const game of finished) {
    const home = game.homeGoals!;
    const guest = game.guestGoals!;
    if (home > guest) result.homeWins++;
    else if (home < guest) result.awayWins++;
    else result.draws++;
    const diff = Math.abs(home - guest);
    if (!result.biggestWin || diff > result.biggestWin.value) result.biggestWin = record(game, diff);
    if (!result.mostGoals || home + guest > result.mostGoals.value) result.mostGoals = record(game, home + guest);
    const count = data.reports.get(game.id)?.spectators;
    if (count != null) spectators.push(count);
  }
  if (spectators.length) result.avgSpectators = Math.round(spectators.reduce((a, b) => a + b, 0) / spectators.length);
  for (const player of data.players.values()) {
    if (!inLeague(player.leagueId) || !player.bestGame) continue;
    if (!result.topPlayerGame || player.bestGame.goals > result.topPlayerGame.goals) {
      const { key, name, teamId, team } = player;
      result.topPlayerGame = { key, name, teamId, team, ...player.bestGame };
    }
  }
  return result;
}

/** Stats of one league, all men's or all women's leagues, or (null) everything for search and comparison. */
function stats(data: SeasonData, scope: number | Gender | null): StatsResponse {
  const genders = new Map(data.leagues.map((l) => [l.id, leagueGender(l)]));
  const inLeague = (l: number) => scope === null || (typeof scope === 'number' ? l === scope : genders.get(l) === scope);
  const finished = data.games.filter((g) => g.status === 'finished' && inLeague(g.leagueId));
  return {
    players: [...data.players.values()].filter((p) => inLeague(p.leagueId)).map(summarizePlayer),
    teams: [...data.teams.values()].filter((t) => inLeague(t.leagueId)),
    reports: finished.filter((g) => data.reports.has(g.id)).length,
    finished: finished.length,
    summary: summary(data, finished, inLeague),
  };
}

/** The best scorers of every game with a report, by game id, best first. */
function topScorers(data: SeasonData): Record<number, GameScorer[]> {
  const best: Record<number, GameScorer[]> = {};
  for (const { key, name, teamId, team, log } of data.players.values()) {
    for (const { gameId, goals } of log) {
      if (goals > 0) (best[gameId] ??= []).push({ key, name, teamId, team, goals });
    }
  }
  for (const list of Object.values(best)) {
    list.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'de'));
    list.length = Math.min(list.length, SCORERS_PER_GAME);
  }
  return best;
}

/** Resolves logos for all teams and copies them next to the data; returns file name and club color by team id. */
async function exportLogos(data: SeasonData) {
  const logos: Record<number, string> = {};
  const colors: Record<number, string> = {};
  await fs.mkdir(path.join(exportDir, 'logos'), { recursive: true });
  for (const team of data.leagues.flatMap((l) => l.teams)) {
    const file = await logoFor(team.name, allowLogoLookups);
    if (!file) continue;
    const name = path.basename(file);
    try {
      await fs.copyFile(filePath(file), path.join(exportDir, 'logos', name));
    } catch {
      console.warn(`cached logo missing for ${team.name}; using team initials`);
      continue;
    }
    logos[team.id] = name;
    const color = await logoColor(file).catch(() => null);
    if (color) colors[team.id] = color;
  }
  return { logos, colors };
}

const GIVE_UP_MS = 7 * 24 * 3600_000;

/** A missing report still counts as "coming" unless h4a never offered one or it kept failing for a week. */
export function reportPending(game: Game, hasReport: boolean, failedAttempt: boolean, now = Date.now()) {
  if (game.status !== 'finished' || hasReport) return false;
  return now - game.ts < GIVE_UP_MS || (game.reportId !== null && !failedAttempt);
}

async function pendingReports(data: SeasonData) {
  const pending: Record<number, number> = {};
  for (const game of data.games) {
    if (game.status !== 'finished' || data.reports.has(game.id)) continue;
    const failed = await exists(keys.reportAttempt(game.id));
    if (reportPending(game, false, failed)) pending[game.leagueId] = (pending[game.leagueId] ?? 0) + 1;
  }
  return pending;
}

async function exportSeason(season: number, current: boolean) {
  const data = await seasonData(season);
  const base = `s/${season}`;

  const meta: Meta = {
    season,
    // Publish links only after a league snapshot exists, including partial syncs.
    leagues: data.leagues.map(toRef),
    ...(await exportLogos(data)),
    teams: data.leagues.flatMap((l) => l.teams.map((t) => ({ id: t.id, name: t.name, leagueId: l.id }))),
    pendingReports: await pendingReports(data),
  };
  await emit(`${base}/meta`, meta);
  await emit(`${base}/games`, [...data.games].sort((a, b) => a.ts - b.ts));
  await emit(`${base}/stats`, stats(data, null));
  // Rankings across leagues stay within men's or women's handball.
  for (const gender of ['M', 'F'] as const) await emit(`${base}/stats-${gender}`, stats(data, gender));
  await emit(`${base}/scorers`, topScorers(data));

  for (const league of data.leagues) {
    await emit(`${base}/league/${league.id}`, league);
    await emit(`${base}/stats-${league.id}`, stats(data, league.id));

    for (const game of league.games) {
      const detail: GameDetail = {
        game,
        league: toRef(league),
        report: data.reports.get(game.id) ?? null,
        summary: await read<Summary>(keys.summary(game.id)),
        reportUrl: game.reportId && game.status === 'finished' ? reportUrl(game.reportId) : null,
        previous: league.games.filter(
          (g) =>
            game.homeId !== null && game.guestId !== null &&
            g.id !== game.id &&
            g.status === 'finished' &&
            [g.homeId, g.guestId].includes(game.homeId) &&
            [g.homeId, g.guestId].includes(game.guestId),
        ),
      };
      await emit(`${base}/game/${game.id}`, detail);
    }

    for (const team of league.teams) {
      const detail: TeamDetail = {
        team,
        league: toRef(league),
        tableRow: league.table.find((r) => r.teamId === team.id) ?? null,
        games: league.games.filter((g) => g.homeId === team.id || g.guestId === team.id),
        stats: data.teams.get(team.id)!,
        players: [...data.players.values()]
          .filter((p) => p.teamId === team.id)
          .map(summarizePlayer)
          .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
      };
      await emit(`${base}/team/${team.id}`, detail);
    }
  }

  for (const player of data.players.values()) {
    await emit(`${base}/player/${player.key}`, player);
  }
  console.log(`exported season ${season}: ${data.leagues.length} leagues, ${data.games.length} games, ${data.players.size} players`);
}

export async function exportAll(index: SeasonIndex, options: { refreshLogos?: boolean } = {}) {
  const staging = `${config.outDir}.staging-${process.pid}`;
  const previous = `${config.outDir}.previous-${process.pid}`;
  exportDir = staging;
  allowLogoLookups = options.refreshLogos ?? true;
  let movedPrevious = false;
  try {
    await fs.mkdir(staging, { recursive: true });
    const snapshots = await Promise.all(index.seasons.map(({ id }) => seasonData(id)));
    const available = index.seasons.filter((_, i) => snapshots[i].leagues.length > 0);
    if (!available.length) throw new Error('No league snapshots available to publish');
    const refreshed = snapshots.flatMap((s) => s.leagues.map((l) => l.updatedAt)).filter((s) => Number.isFinite(Date.parse(s))).sort();
    const seasons: SiteIndex = {
      seasons: available,
      currentSeason: available.some((s) => s.id === index.current) ? index.current : available[0].id,
      // An export or failed sync must never make old results appear freshly fetched.
      updatedAt: refreshed.at(-1) ?? index.updatedAt,
    };
    await emit('index', seasons);
    for (const { id } of available) await exportSeason(id, id === seasons.currentSeason);
    try {
      await fs.rename(config.outDir, previous);
      movedPrevious = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.rename(staging, config.outDir);
    if (movedPrevious) await fs.rm(previous, { recursive: true, force: true });
  } catch (error) {
    if (movedPrevious) await fs.rename(previous, config.outDir).catch(() => undefined);
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    exportDir = config.outDir;
  }
}

