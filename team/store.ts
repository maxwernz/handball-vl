// Storage of the internal statistics in the branch "team-data" (public repo, so every
// file there is encrypted):
//   games/<id>.enc  raw exports + match info, sealed with the storage key
//   aliases.enc     player name merges, sealed with the storage key
//   bundle.enc      everything the page needs, sealed with the team password
// The workflow (team/ingest.ts) and the local CLI (team/cli.ts) both use this module.

import fs from 'node:fs/promises';
import path from 'node:path';
import { open, passwordKey, rawKey, seal } from './lib/crypto.ts';
import { buildGame } from './lib/game.ts';
import type { StatGame, TeamBundle, UploadPayload } from './lib/model.ts';
import config from './config.json' with { type: 'json' };

export interface Secrets {
  viewPassword: string;
  uploadPassword: string;
  storageKey: string;
}

type Stored = Extract<UploadPayload, { action: 'upload' }> & { uploadedAt: string };

export function secretsFromEnv(): Secrets {
  const { TEAM_PASSWORD, TEAM_UPLOAD_PASSWORD, TEAM_STORAGE_KEY } = process.env;
  if (!TEAM_PASSWORD || !TEAM_UPLOAD_PASSWORD || !TEAM_STORAGE_KEY) {
    throw new Error('Secrets TEAM_PASSWORD, TEAM_UPLOAD_PASSWORD und TEAM_STORAGE_KEY müssen gesetzt sein.');
  }
  return { viewPassword: TEAM_PASSWORD, uploadPassword: TEAM_UPLOAD_PASSWORD, storageKey: TEAM_STORAGE_KEY };
}

const safeId = (id: string) => {
  if (!/^[a-z0-9-]{1,80}$/i.test(id)) throw new Error(`Ungültige Spiel-Id: ${id}`);
  return id;
};

export class Store {
  readonly dir: string;
  readonly secrets: Secrets;
  constructor(dir: string, secrets: Secrets) {
    this.dir = dir;
    this.secrets = secrets;
  }

  #storage?: Promise<CryptoKey>;
  storageKey() {
    return (this.#storage ??= rawKey(this.secrets.storageKey));
  }

  async decryptPayload(sealed: string) {
    const key = await passwordKey(this.secrets.uploadPassword, config.uploadSalt);
    return open<UploadPayload>(key, sealed);
  }

  /** Applies one upload/delete/alias change. Returns a log line without player names. */
  async apply(payload: UploadPayload, now = new Date().toISOString()): Promise<string> {
    const key = await this.storageKey();
    await fs.mkdir(path.join(this.dir, 'games'), { recursive: true });
    if (payload.action === 'upload') {
      const id = safeId(payload.meta.id);
      const game = buildGame(payload.files, payload.meta, now); // throws on unreadable files
      const stored: Stored = { ...payload, uploadedAt: now };
      await fs.writeFile(path.join(this.dir, 'games', `${id}.enc`), await seal(key, stored));
      return `Spiel ${id} gespeichert: ${game.goalsFor}:${game.goalsAgainst}, ${game.players.length} Spieler, ${game.events.length} Aktionen, ${game.warnings.length} Hinweise.`;
    }
    if (payload.action === 'delete') {
      const id = safeId(payload.id);
      await fs.rm(path.join(this.dir, 'games', `${id}.enc`), { force: true });
      return `Spiel ${id} gelöscht.`;
    }
    const clean = Object.fromEntries(
      Object.entries(payload.aliases).filter(([a, b]) => typeof a === 'string' && typeof b === 'string' && a.trim() && b.trim()).map(([a, b]) => [a.trim().toLowerCase(), b.trim()]),
    );
    await fs.writeFile(path.join(this.dir, 'aliases.enc'), await seal(key, clean));
    return `${Object.keys(clean).length} Namenszuordnungen gespeichert.`;
  }

  async aliases(): Promise<Record<string, string>> {
    const file = path.join(this.dir, 'aliases.enc');
    const sealed = await fs.readFile(file, 'utf8').catch(() => null);
    return sealed ? open(await this.storageKey(), sealed) : {};
  }

  async games(): Promise<StatGame[]> {
    const key = await this.storageKey();
    const files = await fs.readdir(path.join(this.dir, 'games')).catch(() => [] as string[]);
    const games: StatGame[] = [];
    for (const file of files.filter((f) => f.endsWith('.enc')).sort()) {
      const stored = await open<Stored>(key, await fs.readFile(path.join(this.dir, 'games', file), 'utf8'));
      // Re-parse every time, so parser fixes reach old games too.
      games.push(buildGame(stored.files, stored.meta, stored.uploadedAt));
    }
    return games.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Writes bundle.enc for the page. */
  async build(now = new Date().toISOString()) {
    const bundle: TeamBundle = { version: 1, team: config.team, builtAt: now, games: await this.games(), aliases: await this.aliases() };
    const key = await passwordKey(this.secrets.viewPassword, config.viewSalt);
    await fs.writeFile(path.join(this.dir, 'bundle.enc'), await seal(key, bundle));
    await fs.writeFile(
      path.join(this.dir, 'README.md'),
      '# Interne Mannschaftsstatistik\n\nVerschlüsselte Daten für `/intern/`. Wird vom Workflow „Interne Statistik“ geschrieben, nicht von Hand ändern.\n',
    );
    return bundle;
  }
}
