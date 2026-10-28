const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const longDate = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Game dates are local Berlin wall-clock strings; parse them as such for display. */
function asDate(local: string) {
  return new Date(`${local.slice(0, 10)}T12:00:00`);
}

export function formatDay(local: string) {
  const d = asDate(local);
  return `${weekday.format(d).replace('.', '')} ${dayMonth.format(d)}`;
}

export function formatLongDay(local: string) {
  return longDate.format(asDate(local));
}

export function formatTime(local: string) {
  return local.slice(11, 16);
}

export function isoDay(local: string) {
  return local.slice(0, 10);
}

export function relativeDay(local: string) {
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const diff = Math.round((Date.parse(isoDay(local)) - Date.parse(todayIso)) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return formatLongDay(local);
}

export function percent(part: number, total: number) {
  return total ? `${Math.round((part / total) * 100)} %` : '–';
}

export function perGame(value: number, games: number) {
  return games ? (value / games).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '–';
}

export function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

/** "Männer-Verbandsliga Staffel 1" -> "Staffel 1"; "M-VL-1-BW" -> "VL 1". */
export function leagueLabel(short: string) {
  const m = short.match(/^([MF])-(RL|OL|VL|LL)(?:-(Auf))?(?:-(\d+))?(?:-|$)/);
  if (!m) return short;
  return `${m[1]} · ${m[3] ? 'Aufstieg' : m[2]}${m[4] ? ` ${m[4]}` : ''}`;
}

/** Men first, then women; within each by level (RL → LL) and Staffel. */
export function leagueOrder(a: { short: string }, b: { short: string }) {
  const gender = (short: string) => (short.startsWith('M-') ? 0 : short.startsWith('F-') ? 1 : 2);
  const tier = (short: string) => ['RL', 'OL', 'VL', 'LL'].indexOf(short.split('-')[1]);
  return gender(a.short) - gender(b.short) || tier(a.short) - tier(b.short) || a.short.localeCompare(b.short, 'de', { numeric: true });
}
