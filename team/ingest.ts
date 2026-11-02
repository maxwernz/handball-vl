// Runs in the workflow "Interne Statistik": applies the encrypted upload from the page
// (env PAYLOAD, may be empty for a plain rebuild) and rebuilds bundle.enc.
// The repository is public, so the log must never contain player names.
//
//   node team/ingest.ts <team-data dir>

import { ParseError } from './lib/parse.ts';
import { WrongKeyError } from './lib/crypto.ts';
import { Store, secretsFromEnv } from './store.ts';

const dir = process.argv[2];
if (!dir) throw new Error('Aufruf: node team/ingest.ts <team-data-Verzeichnis>');

const store = new Store(dir, secretsFromEnv());
try {
  const payload = process.env.PAYLOAD?.trim();
  if (payload) console.log(await store.apply(await store.decryptPayload(payload)));
  const bundle = await store.build();
  console.log(`Bundle gebaut: ${bundle.games.length} Spiele.`);
} catch (error) {
  if (error instanceof WrongKeyError) console.error('Upload ließ sich nicht entschlüsseln (falsches Upload-Passwort?).');
  else if (error instanceof ParseError) console.error(`Dateien nicht lesbar: ${error.message}`);
  else console.error((error as Error).message);
  process.exit(1);
}
