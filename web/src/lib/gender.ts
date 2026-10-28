import { useSyncExternalStore } from 'react';
import { leagueGender, type Gender } from '../../../shared/gender.ts';
import type { LeagueRef } from '../../../shared/types.ts';
import { storage } from './storage.ts';

export { GENDER_LABEL, leagueGender, type Gender } from '../../../shared/gender.ts';

/** Which competitions the person follows; stored on the device like the favorites. */
export type GenderFilter = Gender | 'all';

const listeners = new Set<() => void>();
const read = (): GenderFilter => {
  const stored = storage.get('gender');
  return stored === 'M' || stored === 'F' ? stored : 'all';
};
let current = read();

export function setGender(value: GenderFilter) {
  current = value;
  storage.set('gender', value === 'all' ? null : value);
  listeners.forEach((l) => l());
}

export function useGender(): GenderFilter {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => current);
}

/** Gender per league id, for data that only carries a league id (games, players, teams). */
export function genderLookup(leagues: LeagueRef[] | undefined) {
  const map = new Map((leagues ?? []).map((l) => [l.id, leagueGender(l)]));
  return (leagueId: number) => map.get(leagueId) ?? null;
}

/** Splits items into a men's and a women's group (in that order), dropping empty groups. */
export function splitByGender<T>(items: T[], genderOf: (item: T) => Gender | null, filter: GenderFilter = 'all') {
  const order: Gender[] = filter === 'all' ? ['M', 'F'] : [filter];
  const groups = order.map((gender) => ({ gender, items: items.filter((item) => genderOf(item) === gender) }));
  const other = filter === 'all' ? items.filter((item) => genderOf(item) === null) : [];
  return [...groups, ...(other.length ? [{ gender: null, items: other }] : [])].filter((g) => g.items.length);
}
