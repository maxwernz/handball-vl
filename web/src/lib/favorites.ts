import { useSyncExternalStore } from 'react';
import { storage } from './storage.ts';

// Favorite teams are stored by name: team ids change every season, names don't.
const listeners = new Set<() => void>();
let cached: string[] | null = null;

function load(): string[] {
  if (!cached) {
    try {
      cached = JSON.parse(storage.get('favorites') ?? '[]');
    } catch {
      cached = [];
    }
  }
  return cached!;
}

export function toggleFavorite(team: string) {
  const current = load();
  cached = current.includes(team) ? current.filter((t) => t !== team) : [...current, team];
  storage.set('favorites', JSON.stringify(cached));
  listeners.forEach((l) => l());
}

export function useFavorites(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
  );
}
