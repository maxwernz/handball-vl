// Builds the analysis database for the statistics page (/analyse/) and stores it gzipped,
// because GitHub Pages does not compress unknown file types. The page unpacks it in the browser.
//   node analysis/publish.ts <dataDir> <outDir>

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { buildDatabase } from './build.ts';

export function publishDatabase(dataDir: string, outDir: string) {
  const raw = path.join(outDir, 'handball.db');
  const result = buildDatabase(dataDir, raw);
  const db = new DatabaseSync(raw);
  db.exec('VACUUM');
  db.close();
  fs.writeFileSync(path.join(outDir, 'handball.db.gz'), zlib.gzipSync(fs.readFileSync(raw), { level: 9 }));
  fs.rmSync(raw);
  return result;
}

if (import.meta.main) {
  const [dataDir = 'data', outDir = 'dist/analyse'] = process.argv.slice(2);
  const result = publishDatabase(path.resolve(dataDir), path.resolve(outDir));
  const size = fs.statSync(path.join(outDir, 'handball.db.gz')).size;
  console.log(`Analyse-Datenbank veröffentlicht: ${result.games} Spiele, ${result.reports} Berichte, ${(size / 1e6).toFixed(1)} MB`);
}
