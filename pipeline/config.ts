import path from 'node:path';

function numberOption(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

export const config = {
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  /** Where the static JSON "API" for the web app is written. */
  outDir: path.resolve(process.env.OUT_DIR ?? 'web/public/api'),
  /** Which leagues (by h4a short name) the app follows. */
  leaguePattern: new RegExp(process.env.LEAGUE_PATTERN ?? '^[MF]-(RL|OL|VL|LL)(-|$)'),
  /**
   * How many past seasons to keep besides the current one. h4a asks not to be
   * mass-accessed, so backfilling old seasons (hundreds of reports) is off by default.
   */
  pastSeasons: Math.floor(numberOption('PAST_SEASONS', 0)),
  /** Stop fetching reports after this many minutes; the rest follows in the next run. */
  budgetMinutes: numberOption('BUDGET_MINUTES', 8),
  /** Inactive leagues can reuse their snapshot; match-day leagues refresh each run. */
  leagueRefreshMinutes: numberOption('LEAGUE_REFRESH_MINUTES', 360),
  /** Absolute caps keep newly added leagues from causing a burst of backfill traffic. */
  detailRequestLimit: Math.floor(numberOption('DETAIL_REQUEST_LIMIT', 120)),
  /** Written recaps must not consume the allowance needed for player statistics. */
  summaryRequestLimit: Math.floor(numberOption('SUMMARY_REQUEST_LIMIT', 20)),
  teamLookupLimit: Math.floor(numberOption('TEAM_LOOKUP_LIMIT', 20)),
  logoLookupLimit: Math.floor(numberOption('LOGO_LOOKUP_LIMIT', 6)),
  timeZone: 'Europe/Berlin',
};
