import { num, type RawGame, type RawScore } from '../shared/h4a.ts';

type RecordLine = [number, number, number, number, number, number, number, number];

/**
 * Resolve h4a's schedule abbreviations without one extra request per team. A
 * standings record must identify exactly one team on both sides. Ambiguous
 * records (including every 0-game team) are deliberately left unresolved.
 */
export function resolveTeamNames(
  teams: { teamID: string; teamName: string }[],
  table: RawScore[],
  games: RawGame[],
  known: Map<number, string | null> = new Map(),
): Map<number, string> {
  const names = new Set(games.flatMap((g) => [g.gHomeTeam, g.gGuestTeam]));
  const result = new Map<number, string>();
  for (const team of teams) {
    const id = Number(team.teamID);
    const cached = known.get(id);
    if (cached && names.has(cached)) result.set(id, cached);
    else if (names.has(team.teamName)) result.set(id, team.teamName);
  }

  const records = new Map<string, RecordLine>();
  for (const name of names) records.set(name, [0, 0, 0, 0, 0, 0, 0, 0]);
  for (const game of games) {
    const homeGoals = num(game.gHomeGoals);
    const guestGoals = num(game.gGuestGoals);
    const homePoints = num(game.gHomePoints);
    const guestPoints = num(game.gGuestPoints);
    if (homeGoals === null || guestGoals === null || homePoints === null || guestPoints === null) continue;
    for (const home of [true, false]) {
      const line = records.get(home ? game.gHomeTeam : game.gGuestTeam)!;
      const own = home ? homeGoals : guestGoals;
      const other = home ? guestGoals : homeGoals;
      line[0]++;
      line[1] += Number(own > other);
      line[2] += Number(own === other);
      line[3] += Number(own < other);
      line[4] += own;
      line[5] += other;
      line[6] += home ? homePoints : guestPoints;
      line[7] += home ? guestPoints : homePoints;
    }
  }
  const tableKey = (row: RawScore) => JSON.stringify([
    row.numPlayedGames, row.numWonGames, row.numEqualGames, row.numLostGames,
    row.numGoalsShot, row.numGoalsGot, row.pointsPlus, row.pointsMinus,
  ]);
  for (const row of table) {
    const id = Number(row.tabTeamID);
    if (result.has(id) || !row.numPlayedGames) continue;
    const key = tableKey(row);
    if (table.filter((candidate) => tableKey(candidate) === key).length !== 1) continue;
    const matches = [...records].filter(([, record]) => JSON.stringify(record) === key).map(([name]) => name);
    if (matches.length === 1 && ![...result.values()].includes(matches[0])) result.set(id, matches[0]);
  }
  return result;
}
