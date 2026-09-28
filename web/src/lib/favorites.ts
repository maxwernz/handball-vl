import { useMemo, useSyncExternalStore } from 'react';
import { useMeta } from '../api.ts';
import { storage } from './storage.ts';

// Favorites live on the device (no accounts). Teams are stored by name and leagues
// by their h4a short name: ids change every season, names don't.
function listStore(key: string) {
  const listeners = new Set<() => void>();
  let cached: string[] | null = null;

  const load = (): string[] => {
    if (!cached) {
      try {
        const parsed = JSON.parse(storage.get(key) ?? '[]');
        cached = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
      } catch {
        cached = [];
      }
    }
    return cached;
  };
  const set = (values: string[]) => {
    cached = [...new Set(values)];
    storage.set(key, JSON.stringify(cached));
    listeners.forEach((l) => l());
  };
  return {
    load,
    set,
    toggle: (value: string) => {
      const current = load();
      set(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const teams = listStore('favorites');
const leagues = listStore('favoriteLeagues');

export const toggleFavorite = teams.toggle;
export const toggleFavoriteLeague = leagues.toggle;

export function setFavorites(teamNames: string[], leagueShorts: string[]) {
  teams.set(teamNames);
  leagues.set(leagueShorts);
}

/** Favorite team names. */
export function useFavorites(): string[] {
  return useSyncExternalStore(teams.subscribe, teams.load);
}

/** Favorite leagues by short name (e.g. "M-VL-1-BW"). */
export function useFavoriteLeagues(): string[] {
  return useSyncExternalStore(leagues.subscribe, leagues.load);
}

/** Ids of the favorite teams in the selected season. */
export function useFavoriteTeamIds(): Set<number> {
  const { data: meta } = useMeta();
  const names = useFavorites();
  return useMemo(() => new Set((meta?.teams ?? []).filter((t) => names.includes(t.name)).map((t) => t.id)), [meta, names]);
}

/** A link that carries the favorites, to set them up on another device. */
export function shareLink(teamNames: string[], leagueShorts: string[]) {
  const params = new URLSearchParams();
  for (const t of teamNames) params.append('team', t);
  for (const l of leagueShorts) params.append('liga', l);
  return `${location.origin}${import.meta.env.BASE_URL}?${params}`;
}
