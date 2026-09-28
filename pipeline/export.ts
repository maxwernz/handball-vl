// Writes everything the web app reads as static JSON files, laid out like a
// read-only API: api/index.json, api/s/<season>/meta.json, …/league/<id>.json etc.

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Game,
  GameDetail,
  GameRecord,
  LeagueRef,
  LeagueSummary,
  Meta,
  Report,
  SiteIndex,
  StatsResponse,
  Summary,
  TeamDetail,
} from '../shared/types.ts';
import { config } from './config.ts';
import { reportUrl } from './h4a.ts';
import { logoFor } from './logos.ts';
import { seasonData, summarizePlayer, type SeasonData } from './stats.ts';
import { exists, filePath, read } from './store.ts';
import { keys, type SeasonIndex } from './sync.ts';

const toRef = ({ id, short, name }: LeagueRef): LeagueRef => ({ id, short, name });

async function emit(relative: string, value: unknown) {
  const file = path.join(config.outDir, `${relative}.json`);
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

function stats(data: SeasonData, leagueId: number | null): StatsResponse {
  const inLeague = (l: number) => leagueId === null || l === leagueId;
  const finished = data.games.filter((g) => g.status === 'finished' && inLeague(g.leagueId));
  return {
    players: [...data.players.values()].filter((p) => inLeague(p.leagueId)).map(summarizePlayer),
    teams: [...data.teams.values()].filter((t) => inLeague(t.leagueId)),
    reports: finished.filter((g) => data.reports.has(g.id)).length,
    finished: finished.length,
    summary: summary(data, finished, inLeague),
  };
}

/** Resolves logos for all teams and copies them next to the data; returns team id -> file name. */
async function exportLogos(data: SeasonData): Promise<Record<number, string>> {
  const logos: Record<number, string> = {};
  await fs.mkdir(path.join(config.outDir, 'logos'), { recursive: true });
  for (const team of data.leagues.flatMap((l) => l.teams)) {
    const file = await logoFor(team.name);
    if (!file) continue;
    const name = path.basename(file);
    await fs.copyFile(filePath(file), path.join(config.outDir, 'logos', name));
    logos[team.id] = name;
  }
  return logos;
}

async function exportSeason(season: number, current: boolean) {
  const data = await seasonData(season);
  const refs = (await read<LeagueRef[]>(keys.leagues(season))) ?? [];
  const base = `s/${season}`;

  const meta: Meta = {
    season,
    leagues: refs.map(toRef),
    logos: await exportLogos(data),
    teams: data.leagues.flatMap((l) => l.teams.map((t) => ({ id: t.id, name: t.name, leagueId: l.id }))),
    incomplete: !current && !(await exists(keys.complete(season))),
  };
  await emit(`${base}/meta`, meta);
  await emit(`${base}/games`, [...data.games].sort((a, b) => a.ts - b.ts));
  await emit(`${base}/stats`, stats(data, null));

  for (const league of data.leagues) {
    await emit(`${base}/league/${league.id}`, league);
    await emit(`${base}/stats-${league.id}`, stats(data, league.id));

    for (const game of league.games) {
      const detail: GameDetail = {
        game,
        league: toRef(league),
        report: await read<Report>(keys.report(game.id)),
        summary: await read<Summary>(keys.summary(game.id)),
        reportUrl: game.reportId && game.status === 'finished' ? reportUrl(game.reportId) : null,
        previous: league.games.filter(
          (g) =>
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

export async function exportAll(index: SeasonIndex) {
  await fs.rm(config.outDir, { recursive: true, force: true });
  const seasons: SiteIndex = { seasons: index.seasons, currentSeason: index.current, updatedAt: new Date().toISOString() };
  await emit('index', seasons);
  for (const { id } of index.seasons) {
    await exportSeason(id, id === index.current);
  }
}

