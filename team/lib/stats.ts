// Aggregation for /intern/. Everything is counted from the event log, so any choice of
// games and halves gives consistent numbers for the team and every player.

import { ZONES, type StatEvent, type StatGame, type Zone } from './model.ts';
import { normalizeName } from './parse.ts';
import { slug } from './game.ts';

/** 0 = whole game, 1/2 = half. A 30:00 event still belongs to the first half. */
export type Half = 0 | 1 | 2;
export const inHalf = (t: number, half: Half) => half === 0 || (half === 1 ? t <= 1800 : t > 1800);

export interface Line {
  goals: number;
  shots: number;
  zones: Record<Zone, [number, number]>;
  saves: number;
  faced: number;
  /** Goalkeeper per zone: [saves, shots faced]. */
  keeperZones: Record<Zone, [number, number]>;
  assists: number;
  steals: number;
  forcedSteals: number;
  turnovers: number;
  fouls: number;
  sevenWon: number;
  sevenCaused: number;
  twoMin: number;
  yellow: number;
  red: number;
}

const zoneRecord = () => Object.fromEntries(ZONES.map((z) => [z, [0, 0]])) as Record<Zone, [number, number]>;

export const emptyLine = (): Line => ({
  goals: 0, shots: 0, zones: zoneRecord(), saves: 0, faced: 0, keeperZones: zoneRecord(), assists: 0, steals: 0,
  forcedSteals: 0, turnovers: 0, fouls: 0, sevenWon: 0, sevenCaused: 0, twoMin: 0, yellow: 0, red: 0,
});

export function addEvent(l: Line, e: StatEvent) {
  switch (e.kind) {
    case 'goal':
    case 'miss': {
      const made = e.kind === 'goal' ? 1 : 0;
      l.goals += made;
      l.shots += 1;
      if (e.zone) { l.zones[e.zone][0] += made; l.zones[e.zone][1] += 1; }
      break;
    }
    case 'save':
    case 'conceded': {
      const saved = e.kind === 'save' ? 1 : 0;
      l.saves += saved;
      l.faced += 1;
      if (e.zone) { l.keeperZones[e.zone][0] += saved; l.keeperZones[e.zone][1] += 1; }
      break;
    }
    case 'assist': l.assists++; break;
    case 'steal': l.steals++; break;
    case 'forcedSteal': l.forcedSteals++; break;
    case 'turnover': l.turnovers++; break;
    case 'foul': l.fouls++; break;
    case 'sevenWon': l.sevenWon++; break;
    case 'sevenCaused': l.sevenCaused++; break;
    case 'twoMin': l.twoMin++; break;
    case 'yellow': l.yellow++; break;
    case 'red': l.red++; break;
  }
}

export function mergeLines(into: Line, l: Line) {
  for (const k of Object.keys(into) as (keyof Line)[]) {
    if (k === 'zones' || k === 'keeperZones') {
      for (const z of ZONES) { into[k][z][0] += l[k][z][0]; into[k][z][1] += l[k][z][1]; }
    } else into[k] += l[k];
  }
  return into;
}

export const pct = (a: number, b: number) => (b ? a / b : null);

export type Result = 'S' | 'U' | 'N';
export const resultOf = (g: Pick<StatGame, 'goalsFor' | 'goalsAgainst'>): Result =>
  g.goalsFor > g.goalsAgainst ? 'S' : g.goalsFor < g.goalsAgainst ? 'N' : 'U';

export interface GameSummary {
  game: StatGame;
  /** Goals in the selected half (from the running score). */
  for: number;
  against: number;
  team: Line;
  /** Opponent shots on our goalkeepers by zone: [goals, shots]. */
  oppZones: Record<Zone, [number, number]>;
  /** Goals per 10-minute segment (overtime counts to the last one). */
  segments: { for: number; against: number }[];
  longestRun: { for: number; against: number };
}

export function summarize(game: StatGame, half: Half): GameSummary {
  const team = emptyLine();
  const oppZones = zoneRecord();
  const segments = Array.from({ length: 6 }, () => ({ for: 0, against: 0 }));
  let prev = { for: 0, against: 0 };
  let gf = 0, ga = 0;
  let run = { side: '', n: 0 };
  const longestRun = { for: 0, against: 0 };
  for (const e of game.events) {
    const scoredFor = e.for > prev.for, scoredAgainst = e.against > prev.against;
    prev = { for: e.for, against: e.against };
    if (!inHalf(e.t, half)) continue;
    addEvent(team, e);
    if (e.kind === 'save' || e.kind === 'conceded') {
      if (e.zone) { oppZones[e.zone][0] += e.kind === 'conceded' ? 1 : 0; oppZones[e.zone][1] += 1; }
    }
    const seg = segments[Math.min(5, Math.floor(Math.max(0, e.t - 1) / 600))];
    for (const [hit, side] of [[scoredFor, 'for'], [scoredAgainst, 'against']] as const) {
      if (!hit) continue;
      if (side === 'for') gf++; else ga++;
      seg[side]++;
      run = run.side === side ? { side, n: run.n + 1 } : { side, n: 1 };
      longestRun[side] = Math.max(longestRun[side], run.n);
    }
  }
  return { game, for: gf, against: ga, team, oppZones, segments, longestRun };
}

export interface PlayerAgg {
  key: string;
  name: string;
  no: string;
  games: number;
  keeper: boolean;
  line: Line;
  perGame: { game: StatGame; line: Line }[];
}

export function canonicalName(name: string, aliases: Record<string, string>) {
  const n = normalizeName(name);
  return aliases[n.toLowerCase()] ?? n;
}
export const playerKey = (name: string, aliases: Record<string, string>) => slug(canonicalName(name, aliases));

export function players(games: StatGame[], half: Half, aliases: Record<string, string>): PlayerAgg[] {
  const by = new Map<string, PlayerAgg>();
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  for (const game of sorted) {
    const lines = new Map<string, Line>();
    for (const p of game.players) {
      const name = canonicalName(p.name, aliases);
      const key = slug(name);
      const agg = by.get(key) ?? { key, name, no: p.no, games: 0, keeper: false, line: emptyLine(), perGame: [] };
      by.set(key, agg);
      agg.no = p.no; // latest game wins
      agg.name = name;
      agg.games++;
      agg.keeper ||= !!p.keeper;
      if (!lines.has(key)) lines.set(key, emptyLine());
    }
    for (const e of game.events) {
      if (!inHalf(e.t, half)) continue;
      const key = playerKey(e.name, aliases);
      let line = lines.get(key);
      if (!line) {
        // Logged in the event list but missing in the player table: still count it.
        const name = canonicalName(e.name, aliases);
        by.set(key, by.get(key) ?? { key, name, no: e.no, games: 1, keeper: false, line: emptyLine(), perGame: [] });
        line = emptyLine();
        lines.set(key, line);
      }
      addEvent(line, e);
    }
    for (const [key, line] of lines) {
      const agg = by.get(key)!;
      agg.keeper ||= line.faced > 0;
      mergeLines(agg.line, line);
      agg.perGame.push({ game, line });
    }
  }
  return [...by.values()];
}

/** Score progression for the lead chart: lead after each goal. */
export function leadSeries(game: StatGame) {
  const points = [{ t: 0, lead: 0, for: 0, against: 0 }];
  let prev = { for: 0, against: 0 };
  for (const e of game.events) {
    if (e.for !== prev.for || e.against !== prev.against) {
      points.push({ t: e.t, lead: e.for - e.against, for: e.for, against: e.against });
      prev = { for: e.for, against: e.against };
    }
  }
  return points;
}
