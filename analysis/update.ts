// `npm run analyse:update` – fetch the latest "data" branch and rebuild the analysis database.
// Reads only the repository's own data snapshot; it never contacts handball4all.
//   --from <dir>   build from a local data directory instead (e.g. ./data)

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildDatabase } from './build.ts';

export const root = path.resolve(import.meta.dirname, '..');
export const dbFile = path.resolve(process.env.HANDBALL_DB ?? path.join(root, 'analysis', 'handball.db'));
const snapshotDir = path.join(root, 'analysis', '.data');

export function update(from?: string) {
  let dataDir = from ? path.resolve(from) : snapshotDir;
  if (!from) {
    try {
      execFileSync('git', ['fetch', '--quiet', 'origin', 'data'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
      fs.rmSync(snapshotDir, { recursive: true, force: true });
      fs.mkdirSync(snapshotDir, { recursive: true });
      execSync(`git archive origin/data | tar -x -C "${snapshotDir}"`, { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      if (!fs.existsSync(path.join(snapshotDir, 'seasons.json'))) throw new Error(`Datenstand konnte nicht geladen werden: ${(err as Error).message}`);
      console.error('Konnte den neuesten Datenstand nicht holen, nutze den vorhandenen.');
    }
  }
  if (!fs.existsSync(path.join(dataDir, 'seasons.json'))) throw new Error(`Kein Datenstand in ${dataDir}`);
  return buildDatabase(dataDir, dbFile);
}

if (import.meta.main) {
  const at = process.argv.indexOf('--from');
  const result = update(at > 0 ? process.argv[at + 1] : undefined);
  console.log(`Analyse-Datenbank erstellt: ${result.games} Spiele, ${result.reports} Spielberichte → ${path.relative(process.cwd(), dbFile)}`);
}
