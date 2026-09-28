import path from 'node:path';

export const config = {
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  /** Where the static JSON "API" for the web app is written. */
  outDir: path.resolve(process.env.OUT_DIR ?? 'web/public/api'),
  /** Which leagues (by h4a short name) the app follows. */
  leaguePattern: new RegExp(process.env.LEAGUE_PATTERN ?? '^M-VL'),
  /**
   * How many past seasons to keep besides the current one. h4a asks not to be
   * mass-accessed, so backfilling old seasons (hundreds of reports) is off by default.
   */
  pastSeasons: Number(process.env.PAST_SEASONS ?? 0),
  /** Stop fetching reports after this many minutes; the rest follows in the next run. */
  budgetMinutes: Number(process.env.BUDGET_MINUTES ?? 20),
  timeZone: 'Europe/Berlin',
};
