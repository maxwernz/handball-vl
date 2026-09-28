import { config } from './config.ts';

/** Offset of the configured time zone at the given instant, in minutes east of UTC. */
function offsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: config.timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = part?.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!match) return 0;
  const hours = Number(match[1]);
  return hours * 60 + Math.sign(hours) * Number(match[2] ?? 0);
}

/** Parses h4a's `19.09.26` + `17:00` into a local ISO string and an epoch timestamp. */
export function parseKickoff(date: string, time: string): { local: string; ts: number } {
  const [d, m, y] = date.split('.').map(Number);
  const [hh, mm] = (time.trim() || '00:00').split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${2000 + y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}`;
  const asUtc = Date.UTC(2000 + y, m - 1, d, hh, mm);
  const ts = asUtc - offsetMinutes(new Date(asUtc)) * 60_000;
  return { local, ts };
}

/** Monday (local date string) of the week containing the local ISO date. */
export function weekStart(localIso: string): string {
  const day = new Date(`${localIso.slice(0, 10)}T12:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day.toISOString().slice(0, 10);
}
