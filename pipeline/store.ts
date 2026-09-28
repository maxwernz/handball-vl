// JSON files on disk with an in-memory read cache. Everything the app shows is
// served from here; the sync loop is the only writer.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.ts';

const cache = new Map<string, unknown>();

function resolve(key: string) {
  return path.join(config.dataDir, `${key}.json`);
}

export async function read<T>(key: string): Promise<T | null> {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const value = JSON.parse(await fs.readFile(resolve(key), 'utf8')) as T;
    cache.set(key, value);
    return value;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function write<T>(key: string, value: T): Promise<void> {
  const file = resolve(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
  cache.set(key, value);
}

export async function exists(key: string): Promise<boolean> {
  if (cache.has(key)) return true;
  try {
    await fs.access(resolve(key));
    return true;
  } catch {
    return false;
  }
}

export function filePath(relative: string) {
  return path.join(config.dataDir, relative);
}
