// Loading and decrypting the team bundle, plus the upload path through GitHub Actions.

import config from '../../config.json';
import { fromB64, open, passwordKey, rawKey, seal, toB64, WrongKeyError } from '../../lib/crypto.ts';
import type { TeamBundle, UploadPayload } from '../../lib/model.ts';

export { WrongKeyError };
export const CONFIG = config;

/** Root of the public site (where api/ lives). Dev uses the live site, which allows CORS. */
export const SITE = import.meta.env.DEV ? 'https://maxwernz.github.io/handball-vl/' : import.meta.env.BASE_URL.replace(/intern\/$/, '');

const KEY_STORE = 'intern.viewKey';

function storage(kind: 'local' | 'session') {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

async function exportable(password: string, salt: string) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt) as BufferSource, iterations: 600_000 }, base, 256);
  return toB64(new Uint8Array(bits));
}

/** Latest commit of the data branch, so raw.githubusercontent serves fresh data. */
async function dataRef() {
  try {
    const r = await fetch(`https://api.github.com/repos/${config.repo}/commits/${config.branch}`, { headers: { Accept: 'application/vnd.github.sha' }, cache: 'no-store' });
    if (r.ok) return (await r.text()).trim();
  } catch {
    /* rate limit or offline: fall back to the branch name */
  }
  return config.branch;
}

export async function fetchSealedBundle(): Promise<{ sealed: string | null; ref: string }> {
  if (import.meta.env.DEV) {
    const r = await fetch('./__bundle.enc', { cache: 'no-store' });
    return { sealed: r.ok ? await r.text() : null, ref: 'local' };
  }
  const ref = await dataRef();
  const r = await fetch(`https://raw.githubusercontent.com/${config.repo}/${ref}/bundle.enc`, { cache: 'no-cache' });
  if (r.status === 404) return { sealed: null, ref };
  if (!r.ok) throw new Error(`Daten nicht erreichbar (HTTP ${r.status})`);
  return { sealed: await r.text(), ref };
}

const EMPTY: TeamBundle = { version: 1, team: config.team, builtAt: '', games: [], aliases: {} };

/** Unlocks with a password (or the remembered key). Throws WrongKeyError. */
export async function unlock(password: string | null, remember: boolean) {
  let keyB64 = password === null ? storage('local')?.getItem(KEY_STORE) ?? storage('session')?.getItem(KEY_STORE) : null;
  if (password !== null) keyB64 = await exportable(password, config.viewSalt);
  if (!keyB64) throw new WrongKeyError();
  const key = await rawKey(keyB64);
  const { sealed, ref } = await fetchSealedBundle();
  const bundle = sealed ? await open<TeamBundle>(key, sealed) : EMPTY;
  // Only remember a key that actually opened the data (or when there is no data yet).
  storage(remember ? 'local' : 'session')?.setItem(KEY_STORE, keyB64);
  return { bundle, ref, key };
}

export async function reload(key: CryptoKey) {
  const { sealed, ref } = await fetchSealedBundle();
  return { bundle: sealed ? await open<TeamBundle>(key, sealed) : EMPTY, ref };
}

export function forget() {
  storage('local')?.removeItem(KEY_STORE);
  storage('session')?.removeItem(KEY_STORE);
}

export const hasRememberedKey = () => !!(storage('local')?.getItem(KEY_STORE) ?? storage('session')?.getItem(KEY_STORE));

// ---- Upload -----------------------------------------------------------------------------

export interface Uploader {
  key: CryptoKey;
  token: string;
}

export async function unlockUpload(password: string): Promise<Uploader> {
  if (!config.uploadToken) throw new Error('Der Upload ist noch nicht eingerichtet (GitHub-Token fehlt).');
  const key = await passwordKey(password, config.uploadSalt);
  const token = await open<string>(key, config.uploadToken);
  return { key, token };
}

const api = (path: string) => `https://api.github.com/repos/${config.repo}${path}`;
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

export type UploadState = { phase: 'sending' | 'queued' | 'running' } | { phase: 'done' } | { phase: 'failed'; message: string; url?: string };

/** Sends the change to the workflow and reports progress until the data branch is updated. */
export async function submit(up: Uploader, payload: UploadPayload, onState: (s: UploadState) => void, previousRef: string) {
  onState({ phase: 'sending' });
  const sealed = await seal(up.key, payload);
  if (sealed.length > 60_000) throw new Error('Die Dateien sind zu groß für den Upload (über 60 KB verschlüsselt).');
  const r = await fetch(api(`/actions/workflows/${config.workflow}/dispatches`), {
    method: 'POST',
    headers: { ...headers(up.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { payload: sealed }, return_run_details: true }),
  });
  if (r.status === 401 || r.status === 403) throw new Error('GitHub hat den Upload abgelehnt: Token abgelaufen oder ohne Berechtigung.');
  if (!r.ok) throw new Error(`GitHub-Fehler ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const run = r.status === 200 ? ((await r.json().catch(() => null)) as { workflow_run_id?: number; html_url?: string } | null) : null;
  onState({ phase: 'queued' });
  const started = Date.now();
  while (Date.now() - started < 8 * 60_000) {
    await new Promise((res) => setTimeout(res, 5000));
    if (run?.workflow_run_id) {
      const s = await fetch(api(`/actions/runs/${run.workflow_run_id}`), { headers: headers(up.token), cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (s?.status === 'in_progress') onState({ phase: 'running' });
      if (s?.status === 'completed') {
        if (s.conclusion === 'success') return onState({ phase: 'done' });
        return onState({ phase: 'failed', message: 'Die Verarbeitung ist fehlgeschlagen.', url: run.html_url });
      }
    } else if ((await dataRef()) !== previousRef) {
      return onState({ phase: 'done' });
    }
  }
  onState({ phase: 'failed', message: 'Keine Rückmeldung nach 8 Minuten. Bitte später neu laden.' });
}
