import { createContext, useContext, useEffect, useState } from 'react';
import type { StatGame, TeamBundle } from '../../lib/model.ts';
import { resultOf, type Half } from '../../lib/stats.ts';

export type Selection = 'all' | 'home' | 'away' | 'last3' | 'last5' | 'wins' | 'losses' | 'custom';

export interface Filters {
  selection: Selection;
  custom: string[];
  half: Half;
}

export function selectGames(games: StatGame[], f: Filters) {
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  switch (f.selection) {
    case 'home': return sorted.filter((g) => g.home === true);
    case 'away': return sorted.filter((g) => g.home === false);
    case 'last3': return sorted.slice(-3);
    case 'last5': return sorted.slice(-5);
    case 'wins': return sorted.filter((g) => resultOf(g) === 'S');
    case 'losses': return sorted.filter((g) => resultOf(g) === 'N');
    case 'custom': return sorted.filter((g) => f.custom.includes(g.id));
    default: return sorted;
  }
}

export interface TeamState {
  bundle: TeamBundle;
  ref: string;
  key: CryptoKey;
  /** Games after the filter, oldest first. */
  games: StatGame[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

export const TeamContext = createContext<TeamState | null>(null);
export const useTeam = () => useContext(TeamContext)!;

// ---- Hash routing -------------------------------------------------------------------------

export type Route =
  | { page: 'overview' }
  | { page: 'players' }
  | { page: 'player'; key: string }
  | { page: 'games' }
  | { page: 'game'; id: string }
  | { page: 'upload' };

export function parseRoute(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/').map(decodeURIComponent);
  if (a === 'spieler') return b ? { page: 'player', key: b } : { page: 'players' };
  if (a === 'spiele') return { page: 'games' };
  if (a === 'spiel' && b) return { page: 'game', id: b };
  if (a === 'upload') return { page: 'upload' };
  return { page: 'overview' };
}

export const href = {
  overview: '#/',
  players: '#/spieler',
  player: (key: string) => `#/spieler/${encodeURIComponent(key)}`,
  games: '#/spiele',
  game: (id: string) => `#/spiel/${encodeURIComponent(id)}`,
  upload: '#/upload',
};

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (h: string) => {
  location.hash = h;
};

const FILTER_KEY = 'intern.filters';
export function loadFilters(): Filters {
  try {
    const f = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null');
    if (f && typeof f.selection === 'string' && Array.isArray(f.custom) && [0, 1, 2].includes(f.half)) return f;
  } catch {
    /* storage blocked */
  }
  return { selection: 'all', custom: [], half: 0 };
}
export function saveFilters(f: Filters) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    /* storage blocked */
  }
}
