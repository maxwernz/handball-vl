import { useState } from 'react';

// localStorage can be unavailable (private mode, blocked site data); the app must work without it.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`hvl:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(`hvl:${key}`);
      else localStorage.setItem(`hvl:${key}`, value);
    } catch {
      /* ignore */
    }
  },
};

/** State that survives page changes and reloads on this device. */
export function useStoredState<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = storage.get(key);
    return allowed.includes(stored as T) ? stored as T : fallback;
  });
  return [value, (next: T) => { storage.set(key, next); setValue(next); }];
}
