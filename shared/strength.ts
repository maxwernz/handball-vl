// Players on court per side, derived from the time penalties in a match report.

import type { MatchEvent } from './types.ts';

export type Side = 'home' | 'guest';
export const PENALTY_SECONDS = 120;

/** One player missing for a side from `start` (inclusive) to `end` (exclusive), in game seconds. */
export interface Shortage {
  side: Side;
  start: number;
  end: number;
  /** Index of the report event that caused it; events after this index see the shortage. */
  index: number;
  player: string | null;
  type: 'twoMinutes' | 'disqualification';
}

/**
 * Each 2-minute penalty or disqualification takes one player off for two minutes.
 * Reports list a third 2-minute penalty and the resulting red card at the same
 * second; that is one shortage. A double 2-minute penalty (2+2) is one player
 * missing for four minutes, not two players for two.
 */
export function shortages(events: MatchEvent[]): Shortage[] {
  const result: Shortage[] = [];
  events.forEach((e, index) => {
    if ((e.type !== 'twoMinutes' && e.type !== 'disqualification') || !e.side) return;
    const same = result.find((s) => s.side === e.side && s.player === e.player && s.player !== null && events[s.index].t === e.t);
    if (same) {
      if (same.type === 'twoMinutes' && e.type === 'twoMinutes') same.end += PENALTY_SECONDS;
      else same.type = 'disqualification';
      return;
    }
    result.push({ side: e.side, start: e.t, end: e.t + PENALTY_SECONDS, index, player: e.player, type: e.type });
  });
  return result;
}

/** Players missing per side at the moment of the event with this index. */
export function playersDown(list: Shortage[], events: MatchEvent[], index: number): Record<Side, number> {
  const t = events[index].t;
  const down = { home: 0, guest: 0 };
  for (const s of list) if (s.index < index && s.start <= t && t < s.end) down[s.side]++;
  return down;
}

/** Continuous stretches in which one side has fewer players than the other. */
export interface StrengthPhase {
  /** The side playing short-handed. */
  short: Side;
  start: number;
  end: number;
  /** How many players fewer the short side has (1 or 2). */
  difference: number;
}

export function strengthPhases(list: Shortage[]): StrengthPhase[] {
  const points = [...new Set(list.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
  const phases: StrengthPhase[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = [points[i], points[i + 1]];
    const count = (side: Side) => list.filter((s) => s.side === side && s.start <= from && from < s.end).length;
    const diff = count('home') - count('guest');
    if (!diff) continue;
    const short: Side = diff > 0 ? 'home' : 'guest';
    const last = phases.at(-1);
    // A change from 2 to 1 players down stays one phase for the same short side.
    if (last && last.short === short && last.end === from) (last.end = to, last.difference = Math.max(last.difference, Math.abs(diff)));
    else phases.push({ short, start: from, end: to, difference: Math.abs(diff) });
  }
  return phases;
}
