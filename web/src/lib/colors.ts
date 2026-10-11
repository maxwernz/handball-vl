// Club colors: a game is shown in the colors of its two teams instead of the
// default blue and orange, as long as the two can be told apart.

import type { CSSProperties } from 'react';
import { useMeta } from '../api.ts';

const DEFAULTS = { home: '#2a78d6', guest: '#eb6834' };
/**
 * Shown for a team without a color of its own, or whose color is too close to the
 * opponent's: a neutral gray rather than an invented color that looks like a club's.
 */
export const NEUTRAL = 'var(--color-ink-2)';
const MIN_HUE_GAP = 40;

function hue(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  return 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
}

function alike(a: string, b: string) {
  const gap = Math.abs(hue(a) - hue(b));
  return Math.min(gap, 360 - gap) < MIN_HUE_GAP;
}

/** The club's own color, if its logo has one. */
export function useClubColor(teamId: number | null): string | undefined {
  const colors = useMeta().data?.colors;
  return teamId !== null ? colors?.[teamId] : undefined;
}

/** Home and guest color for a game: each club's own where the two can be told apart. */
export function useTeamColors(homeId: number | null, guestId: number | null): { home: string; guest: string } {
  const home = useClubColor(homeId);
  const guest = useClubColor(guestId);
  if (!home && !guest) return DEFAULTS;
  if (home && guest && alike(home, guest)) return { home, guest: NEUTRAL };
  return { home: home ?? NEUTRAL, guest: guest ?? NEUTRAL };
}

/** Sets the home/guest color tokens for everything inside the element. */
export function colorStyle({ home, guest }: { home: string; guest: string }): CSSProperties {
  return { '--color-home': home, '--color-guest': guest } as CSSProperties;
}
