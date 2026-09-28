// Club logos come from handball.net's club directory. Team names are matched to
// clubs by token similarity, the images are shrunk to small WebP files and
// cached on disk. Wrong or missing matches can be fixed in data/logo-overrides.json:
//   { "SG Hofen/Hüttlingen": "https://…/logo.png", "Some Team": null }

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fetchJson, fetchWithRetry } from './http.ts';
import { filePath, read, write } from './store.ts';

const API = 'https://www.handball.net/api/new';
const HEADERS = { Referer: 'https://www.handball.net/' };
const INDEX_KEY = 'logos/index';
/** Negative results are retried after this long. */
const MISS_TTL_MS = 7 * 24 * 3600_000;

interface Club {
  id: string;
  name: string;
  logo: string | null;
}

interface IndexEntry {
  file: string | null;
  club: string | null;
  checkedAt: string;
}

const STOPWORDS = new Set([
  'tsv', 'tv', 'sv', 'sg', 'hc', 'hg', 'hsg', 'tus', 'sf', 'spvgg', 'fc', 'vfl', 'vfb', 'tg', 'tsg', 'ssv', 'asv',
  'jsg', 'hv', 'ev', 'eh', 'handball', 'turnverein', 'sportverein', 'e', 'v', 'rot', 'weiss', 'weiß', 'und',
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !/^\d+$/.test(t));
}

/** Team name without the trailing team number, e.g. "TSV Neuhausen/F. 1898 2" -> "TSV Neuhausen/F. 1898". */
export function clubName(team: string) {
  return team.replace(/\s+\d{1,2}$/, '').trim();
}

function similarity(team: string, club: string) {
  const a = new Set(tokens(team));
  const b = new Set(tokens(club));
  const distinctive = [...a].filter((t) => !STOPWORDS.has(t));
  if (!distinctive.length) return 0;
  let hits = 0;
  for (const t of distinctive) {
    if ([...b].some((u) => u === t || (t.length >= 4 && (u.startsWith(t) || t.startsWith(u))))) hits++;
  }
  const shared = [...a].filter((t) => b.has(t)).length;
  return hits / distinctive.length + shared / Math.max(a.size, b.size) / 2;
}

async function searchClubs(query: string): Promise<Club[]> {
  const url = `${API}/teams/clubs?${new URLSearchParams({ 'filter[search]': query, per_page: '20' })}`;
  const res = await fetchJson<{ data?: Club[] }>(url, { headers: HEADERS, gapMs: 600 });
  return res.data ?? [];
}

async function findClub(team: string): Promise<Club | null> {
  const base = clubName(team);
  const distinctive = tokens(base).filter((t) => !STOPWORDS.has(t) && t.length > 2);
  const queries = [...new Set([base, ...distinctive.sort((a, b) => b.length - a.length).slice(0, 2)])];
  let best: { club: Club; score: number } | null = null;
  for (const query of queries) {
    for (const club of await searchClubs(query)) {
      if (!club.logo || club.logo.endsWith('/')) continue;
      const score = similarity(base, club.name);
      if (!best || score > best.score) best = { club, score };
    }
    if (best && best.score >= 1.2) break;
  }
  return best && best.score >= 0.9 ? best.club : null;
}

async function storeImage(url: string, key: string): Promise<string | null> {
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const file = `logos/${key}.webp`;
  await fs.mkdir(path.dirname(filePath(file)), { recursive: true });
  await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82 })
    .toFile(filePath(file));
  return file;
}

function slug(name: string) {
  return tokens(name).join('-') || 'team';
}

const pending = new Map<string, Promise<string | null>>();

/** Path (relative to the data dir) of the logo for a team, resolving it on first use. */
export function logoFor(team: string): Promise<string | null> {
  const key = clubName(team);
  let job = pending.get(key);
  if (!job) {
    job = resolveLogo(key).finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

async function resolveLogo(key: string): Promise<string | null> {
  const index = (await read<Record<string, IndexEntry>>(INDEX_KEY)) ?? {};
  const overrides = (await read<Record<string, string | null>>('logo-overrides')) ?? {};
  const entry = index[key];
  const override = key in overrides ? overrides[key] : undefined;

  if (entry && override === undefined) {
    const fresh = entry.file || Date.now() - Date.parse(entry.checkedAt) < MISS_TTL_MS;
    if (fresh) return entry.file;
  }
  if (entry && override !== undefined && entry.club === `override:${override}`) return entry.file;

  let file: string | null = null;
  let club: string | null = null;
  try {
    if (override !== undefined) {
      club = `override:${override}`;
      file = override ? await storeImage(override, slug(key)) : null;
    } else {
      const match = await findClub(key);
      club = match?.name ?? null;
      file = match?.logo ? await storeImage(match.logo, slug(key)) : null;
    }
  } catch (err) {
    console.warn(`logo lookup failed for ${key}:`, (err as Error).message);
    return entry?.file ?? null;
  }
  const latest = (await read<Record<string, IndexEntry>>(INDEX_KEY)) ?? {};
  await write(INDEX_KEY, { ...latest, [key]: { file, club, checkedAt: new Date().toISOString() } });
  return file;
}
