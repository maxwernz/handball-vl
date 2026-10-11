import { useRef, type TouchEvent } from 'react';

const MIN_DISTANCE = 60;
const MAX_MS = 600;

/** Whether a touch starting here belongs to something that handles horizontal movement itself. */
function claimsSwipe(target: EventTarget | null, root: Element) {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el instanceof SVGElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return true; // charts follow the finger
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/** Touch handlers that move to the next or previous tab on a quick horizontal swipe. */
export function useTabSwipe<T extends string>(ids: T[], active: T | undefined, onChange: (id: T) => void) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  return {
    onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      start.current = e.touches.length === 1 && !claimsSwipe(e.target, e.currentTarget) ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
    },
    onTouchEnd(e: TouchEvent) {
      const from = start.current;
      start.current = null;
      if (!from || active === undefined) return;
      const dx = e.changedTouches[0].clientX - from.x;
      const dy = e.changedTouches[0].clientY - from.y;
      if (Date.now() - from.at > MAX_MS || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return;
      const next = ids[ids.indexOf(active) + (dx < 0 ? 1 : -1)];
      if (next) onChange(next);
    },
  };
}
