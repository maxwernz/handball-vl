import type { Game, League, TableRow } from '../../../shared/types.ts';

export type TableView = 'all' | 'home' | 'away';

/** Recomputes the table for home or away games only. The official ranking
 *  (which h4a computes with head-to-head rules) is used for the full table. */
export function tableFor(league: League, view: TableView): TableRow[] {
  if (view === 'all') return league.table;
  const rows = new Map<number, TableRow>(
    league.table.map((r) => [
      r.teamId,
      { ...r, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, pointsPlus: 0, pointsMinus: 0 },
    ]),
  );
  for (const g of league.games) {
    if (g.status !== 'finished') continue;
    const teamId = view === 'home' ? g.homeId : g.guestId;
    const row = teamId !== null ? rows.get(teamId) : undefined;
    if (!row) continue;
    const own = view === 'home' ? g.homeGoals! : g.guestGoals!;
    const other = view === 'home' ? g.guestGoals! : g.homeGoals!;
    row.played++;
    row.goalsFor += own;
    row.goalsAgainst += other;
    if (own > other) (row.won++, (row.pointsPlus += 2));
    else if (own < other) (row.lost++, (row.pointsMinus += 2));
    else (row.drawn++, row.pointsPlus++, row.pointsMinus++);
  }
  return ranked([...rows.values()]);
}

function ranked(rows: TableRow[]): TableRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.pointsPlus - a.pointsPlus ||
      a.pointsMinus - b.pointsMinus ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor,
  );
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface RankHistory {
  rounds: number[];
  /** Rank of each team after each of `rounds`. */
  ranks: Map<number, number[]>;
}

/**
 * Table position of every team after each matchday. A matchday counts every game
 * finished up to its last kickoff, so rescheduled games show up when they were played.
 * Earlier matchdays are recomputed from the results; teams level on points share a place.
 */
export function rankHistory(league: League): RankHistory {
  const finished = league.games.filter((g) => g.status === 'finished');
  const rounds = [...new Set(finished.map((g) => g.round).filter((r): r is number => r !== null))].sort((a, b) => a - b);
  const ranks = new Map<number, number[]>(league.teams.map((t) => [t.id, []]));
  const rows = new Map<number, TableRow>(
    league.teams.map((t) => [
      t.id,
      { rank: 0, teamId: t.id, team: t.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, pointsPlus: 0, pointsMinus: 0 },
    ]),
  );
  const add = (teamId: number | null, own: number, other: number) => {
    const row = teamId !== null ? rows.get(teamId) : undefined;
    if (!row) return;
    row.played++;
    row.goalsFor += own;
    row.goalsAgainst += other;
    if (own > other) (row.won++, (row.pointsPlus += 2));
    else if (own < other) (row.lost++, (row.pointsMinus += 2));
    else (row.drawn++, row.pointsPlus++, row.pointsMinus++);
  };
  let next = 0;
  for (const round of rounds) {
    const cutoff = Math.max(...league.games.filter((g) => g.round === round).map((g) => g.ts));
    for (; next < finished.length && finished[next].ts <= cutoff; next++) {
      const g = finished[next];
      add(g.homeId, g.homeGoals!, g.guestGoals!);
      add(g.guestId, g.guestGoals!, g.homeGoals!);
    }
    // Like h4a, teams level on points share a place.
    const all = [...rows.values()];
    for (const row of all) {
      const ahead = all.filter((o) => o.pointsPlus > row.pointsPlus || (o.pointsPlus === row.pointsPlus && o.pointsMinus < row.pointsMinus)).length;
      ranks.get(row.teamId)!.push(ahead + 1);
    }
  }
  // The latest standing comes from the official table (h4a's tie-breaking can't be reproduced exactly).
  if (rounds.length && next === finished.length) {
    for (const row of league.table) {
      const list = ranks.get(row.teamId);
      if (list?.length) list[list.length - 1] = row.rank;
    }
  }
  return { rounds, ranks };
}

export function formOf(games: Game[], teamId: number, count = 5): ('W' | 'D' | 'L')[] {
  return games
    .filter((g) => g.status === 'finished' && (g.homeId === teamId || g.guestId === teamId))
    .slice(-count)
    .map((g) => {
      const home = g.homeId === teamId;
      const own = home ? g.homeGoals! : g.guestGoals!;
      const other = home ? g.guestGoals! : g.homeGoals!;
      return own > other ? 'W' : own < other ? 'L' : 'D';
    });
}

/** The matchday to show by default: the first one that still has unplayed games. */
export function currentRound(games: Game[]): number | null {
  const rounds = [...new Set(games.map((g) => g.round).filter((r): r is number => r !== null))].sort((a, b) => a - b);
  if (!rounds.length) return null;
  const now = Date.now();
  const open = rounds.find((r) => games.some((g) => g.round === r && (g.status !== 'finished' || g.ts > now - 36 * 3600_000)));
  return open ?? rounds[rounds.length - 1];
}
