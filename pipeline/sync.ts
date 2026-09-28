// Brings the local store in step with h4a: leagues, tables and schedules on
// every run, match reports and summaries for finished games within a time budget.

import {
  gameStatus,
  normalizeTable,
  num,
  rawGames,
  scoreFields,
  type RawGame,
} from '../shared/h4a.ts';
import type { Game, League, LeagueRef, Report, Season, Summary, Team } from '../shared/types.ts';
import { config } from './config.ts';
import { fetchLeague, fetchOrg, fetchReportPdf, fetchRobotext } from './h4a.ts';
import { RateLimitedError } from './http.ts';
import { parseReport } from './report.ts';
import { exists, read, write } from './store.ts';
import { parseKickoff, weekStart } from './time.ts';

export interface SeasonIndex {
  seasons: Season[];
  current: number;
  updatedAt: string;
}

/** Reports are fetched once more after this long, to pick up corrections. */
const REPORT_RECHECK_MS = 36 * 3600_000;
/** Reports are only published once the game is over. */
const REPORT_EARLIEST_MS = 100 * 60_000;
export const keys = {
  index: 'seasons',
  leagues: (season: number) => `s${season}/leagues`,
  league: (season: number, id: number) => `s${season}/league-${id}`,
  complete: (season: number) => `s${season}/complete`,
  report: (gameId: number) => `reports/${gameId}`,
  summary: (gameId: number) => `summaries/${gameId}`,
};

function normalizeGames(raw: RawGame[], leagueId: number, shortToId: Map<string, number>, teamCount: number): Game[] {
  const games: Game[] = raw.map((g) => {
    const kickoff = parseKickoff(g.gDate, g.gTime);
    const game: Game = {
      id: Number(g.gID),
      reportId: num(g.sGID),
      no: g.gNo,
      leagueId,
      date: kickoff.local,
      ts: kickoff.ts,
      round: null,
      venue: g.gGymnasiumName
        ? { name: g.gGymnasiumName, town: g.gGymnasiumTown, street: g.gGymnasiumStreet, postal: g.gGymnasiumPostal }
        : null,
      home: g.gHomeTeam,
      guest: g.gGuestTeam,
      homeId: shortToId.get(g.gHomeTeam) ?? null,
      guestId: shortToId.get(g.gGuestTeam) ?? null,
      ...scoreFields(g),
      status: 'scheduled',
      comment: String(g.gComment ?? '').trim(),
      hasSummary: g.robotextstate === 'generated',
    };
    game.status = gameStatus(game);
    return game;
  });
  games.sort((a, b) => a.ts - b.ts);

  // h4a has no matchday numbers, so derive them: every week with (roughly) a
  // full round of games is a matchday, sparse weeks hold rescheduled games.
  const perRound = Math.max(1, Math.floor(teamCount / 2));
  const byWeek = new Map<string, Game[]>();
  for (const game of games) {
    const week = weekStart(game.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), game]);
  }
  let round = 0;
  for (const week of [...byWeek.keys()].sort()) {
    const weekGames = byWeek.get(week)!;
    if (weekGames.length >= Math.ceil(perRound / 2)) {
      round++;
      for (const game of weekGames) game.round = round;
    }
  }
  return games;
}

/** Finds the abbreviated name h4a uses for a team: the one present in all of its games. */
async function lookupShortName(season: number, leagueId: number, teamId: number): Promise<string | null> {
  const res = await fetchLeague(season, leagueId, teamId);
  const games = rawGames(res);
  if (!games.length) return null;
  let candidates = new Set([games[0].gHomeTeam, games[0].gGuestTeam]);
  for (const g of games.slice(1)) candidates = new Set([g.gHomeTeam, g.gGuestTeam].filter((n) => candidates.has(n)));
  return candidates.size === 1 ? [...candidates][0] : null;
}

export async function syncLeague(season: number, ref: LeagueRef): Promise<League> {
  const previous = await read<League>(keys.league(season, ref.id));
  const res = await fetchLeague(season, ref.id);
  const content = res.content;
  const known = new Map(previous?.teams.map((t) => [t.id, t.short]) ?? []);

  const teams: Team[] = [];
  for (const t of content.teamsList) {
    const id = Number(t.teamID);
    const short = known.get(id) ?? (await lookupShortName(season, ref.id, id).catch(() => null));
    teams.push({ id, name: t.teamName, short });
  }
  const shortToId = new Map(teams.filter((t) => t.short).map((t) => [t.short!, t.id]));

  const league: League = {
    ...ref,
    season,
    updatedAt: new Date().toISOString(),
    sourceUpdated: res.head.actualized.replace(/^Letzte Änderung:\s*/, ''),
    teams,
    table: normalizeTable(content.score),
    tableNotes: content.scoreComments.map((c) => c.replace(/<br\s*\/?>/g, ' ')),
    games: normalizeGames(rawGames(res), ref.id, shortToId, teams.length),
  };
  await write(keys.league(season, ref.id), league);
  return league;
}

function sanitizeSummary(raw: { text: string; footer: string }): Summary {
  const title = raw.text.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]?.trim() ?? '';
  const html = (raw.text.replace(/<h1>[\s\S]*?<\/h1>/, '') + (raw.footer ?? ''))
    .replace(/<p id='\[\$grafik\$\]'><\/p>/g, '')
    .replace(/<(?!\/?(p|em|strong|b|i|br|h2|h3)\b)[^>]*>/gi, '')
    .replace(/<(p|em|strong|b|i|br|h2|h3)\s[^>]*>/gi, '<$1>')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
  return { title, html };
}

async function syncGameDetails(game: Game) {
  if (game.status !== 'finished' || Date.now() < game.ts + REPORT_EARLIEST_MS) return;
  if (game.reportId) {
    const existing = await read<Report>(keys.report(game.id));
    const recheck = existing && Date.parse(existing.fetchedAt) < game.ts + REPORT_RECHECK_MS && Date.now() > game.ts + REPORT_RECHECK_MS;
    if (!existing || recheck) {
      const pdf = await fetchReportPdf(game.reportId);
      if (pdf) {
        const report = await parseReport(pdf, game.id, game.reportId, { home: game.home, guest: game.guest });
        await write(keys.report(game.id), report);
      }
    }
  }
  if (game.hasSummary && !(await exists(keys.summary(game.id)))) {
    const robotext = await fetchRobotext(game.id);
    if (robotext) await write(keys.summary(game.id), sanitizeSummary(robotext));
  }
}

/** Fetches missing reports and summaries, newest games first, until the deadline. Returns false if it ran out of time. */
async function syncDetails(leagues: League[], deadline: number): Promise<boolean> {
  const games = leagues.flatMap((l) => l.games).sort((a, b) => b.ts - a.ts);
  for (const game of games) {
    if (Date.now() > deadline) return false;
    try {
      await syncGameDetails(game);
    } catch (err) {
      if (err instanceof RateLimitedError) throw err;
      console.warn(`details for game ${game.id} failed:`, (err as Error).message);
    }
  }
  return true;
}

export async function syncIndex(): Promise<SeasonIndex> {
  const res = await fetchOrg();
  const ids = Object.keys(res.menu.period.list).map(Number);
  const current = Number(res.menu.period.selectedID);
  // Only regular seasons ("25/26"), not the summer beach rounds ("S 2026").
  const seasons = ids
    .filter((id) => /^\d\d\/\d\d$/.test(res.menu.period.list[id]))
    .filter((id) => id <= current)
    .sort((a, b) => b - a)
    .slice(0, config.pastSeasons + 1)
    .map((id) => ({ id, name: `20${res.menu.period.list[id]}` }));
  const index: SeasonIndex = { seasons, current, updatedAt: new Date().toISOString() };
  await write(keys.index, index);
  return index;
}

async function discoverLeagues(season: number): Promise<LeagueRef[]> {
  const res = await fetchOrg(season);
  const refs = res.content.classes
    .filter((c) => config.leaguePattern.test(c.gClassSname))
    .map((c) => ({ id: Number(c.gClassID), short: c.gClassSname, name: c.gClassLname }));
  // Keep leagues seen earlier in the season even if h4a's weekly view omits them.
  const previous = (await read<LeagueRef[]>(keys.leagues(season))) ?? [];
  const merged = [...refs, ...previous.filter((p) => !refs.some((r) => r.id === p.id))];
  merged.sort((a, b) => a.short.localeCompare(b.short, 'de', { numeric: true }));
  await write(keys.leagues(season), merged);
  return merged;
}

export async function loadLeagues(season: number): Promise<League[]> {
  const refs = (await read<LeagueRef[]>(keys.leagues(season))) ?? [];
  const leagues = await Promise.all(refs.map((r) => read<League>(keys.league(season, r.id))));
  return leagues.filter((l): l is League => l !== null);
}

/**
 * One sync pass. The current season is refreshed completely; a past season is
 * fetched until it is complete and then left alone.
 */
export async function syncAll(): Promise<SeasonIndex | null> {
  try {
    return await syncPass();
  } catch (err) {
    if (!(err instanceof RateLimitedError)) throw err;
    // Publish what we have; the next scheduled run picks up the rest.
    console.warn(`${err.message} – stopping this run.`);
    return read<SeasonIndex>(keys.index);
  }
}

async function syncPass(): Promise<SeasonIndex> {
  const deadline = Date.now() + config.budgetMinutes * 60_000;
  const index = await syncIndex();
  for (const { id: season } of index.seasons) {
    const current = season === index.current;
    if (!current && (await exists(keys.complete(season)))) continue;
    const refs = await discoverLeagues(season);
    let failed = false;
    for (const ref of refs) {
      try {
        await syncLeague(season, ref);
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        failed = true;
        console.warn(`league ${ref.short} (${season}) failed:`, (err as Error).message);
      }
    }
    const leagues = await loadLeagues(season);
    const done = await syncDetails(leagues, deadline);
    console.log(`season ${season}: ${done ? 'details complete' : 'out of time, continuing next run'}`);
    if (!current && done && !failed && leagues.length) await write(keys.complete(season), { at: new Date().toISOString() });
  }
  return index;
}
