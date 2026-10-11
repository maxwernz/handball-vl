// Club colors: a game is shown in the colors of its two teams instead of the
// default blue and orange, as long as the two can be told apart.

import type { CSSProperties } from 'react';
import { useMeta } from '../api.ts';

/** Stand-ins when a club has no color or the two are too alike; the first two are the default home and guest colors. */
const STAND_INS = ['#2a78d6', '#eb6834', '#8a4fd0'];
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

/** Home and guest color for a game. The home team keeps its color; the guest gets a stand-in if it is too close. */
export function useTeamColors(homeId: number | null, guestId: number | null): { home: string; guest: string } {
  const colors = useMeta().data?.colors ?? {};
  const own = (id: number | null) => (id !== null ? colors[id] : undefined);
  const standIn = (other: string) => STAND_INS.find((c) => !alike(c, other))!;
  const guestColor = own(guestId);
  const home = own(homeId) ?? (guestColor ? standIn(guestColor) : STAND_INS[0]);
  const guest = guestColor && !alike(guestColor, home) ? guestColor : home === STAND_INS[0] ? STAND_INS[1] : standIn(home);
  return { home, guest };
}

/** Sets the home/guest color tokens for everything inside the element. */
export function colorStyle({ home, guest }: { home: string; guest: string }): CSSProperties {
  return { '--color-home': home, '--color-guest': guest } as CSSProperties;
}
