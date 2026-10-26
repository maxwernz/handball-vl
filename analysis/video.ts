// Converts game clock times into positions in a match video.

const HALF_SECONDS = 1800;

/** Parses "MM:SS", "H:MM:SS" or plain seconds. */
export function parseTime(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) throw new Error(`Ungültige Zeit: "${value}"`);
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export function formatVideo(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function videoTimestamps(input: { times: string[]; first_half_kickoff: string; second_half_kickoff?: string; lead_seconds?: number; clip_seconds?: number }) {
  const lead = input.lead_seconds ?? 20;
  const clip = input.clip_seconds ?? 120;
  const first = parseTime(input.first_half_kickoff);
  const second = input.second_half_kickoff ? parseTime(input.second_half_kickoff) : null;
  return input.times.map((time) => {
    const t = parseTime(time);
    const secondHalf = t >= HALF_SECONDS;
    if (secondHalf && second === null) throw new Error(`Für ${time} fehlt der Anpfiff der 2. Halbzeit (second_half_kickoff).`);
    const at = secondHalf ? second! + (t - HALF_SECONDS) : first + t;
    return { game_time: time, video_time: formatVideo(at), clip_start: formatVideo(at - lead), clip_end: formatVideo(at + clip) };
  });
}
