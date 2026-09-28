import { createContext, useContext, useState, type ReactNode } from 'react';
import { storage } from './storage.ts';

type SeasonId = number | 'current';

const SeasonContext = createContext<{ season: SeasonId; setSeason: (s: SeasonId) => void }>({
  season: 'current',
  setSeason: () => {},
});

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [season, setSeasonState] = useState<SeasonId>(() => {
    const stored = storage.get('season');
    return stored && stored !== 'current' ? Number(stored) : 'current';
  });
  const setSeason = (s: SeasonId) => {
    storage.set('season', String(s));
    setSeasonState(s);
  };
  return <SeasonContext.Provider value={{ season, setSeason }}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  return useContext(SeasonContext);
}
