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

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === x ? ((y - z) / d + 6) % 6 : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}

function toHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const HUE_BINS = 24;

/**
 * A club's signature color: the dominant saturated hue of its logo, brought to a
 * lightness that reads on light and dark backgrounds. Null for black-and-white logos.
 */
export async function logoColor(file: string): Promise<string | null> {
  const { data } = await sharp(filePath(file)).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, x: 0, y: 0, s: 0, l: 0 }));
  let opaque = 0;
  let colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const [h, s, l] = toHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.35 || l < 0.15 || l > 0.85) continue;
    colored++;
    const bin = bins[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS];
    bin.weight += s;
    bin.x += Math.cos((h * Math.PI) / 180) * s;
    bin.y += Math.sin((h * Math.PI) / 180) * s;
    bin.s += s * s;
    bin.l += l * s;
  }
  if (!opaque || colored / opaque < 0.04) return null;
  const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a));
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  // Yellows only read on a light background when they are darker than the rest.
  const lightest = hue > 40 && hue < 75 ? 0.42 : 0.5;
  return toHex(hue, Math.max(0.55, best.s / best.weight), Math.min(lightest, Math.max(0.38, best.l / best.weight)));
}
