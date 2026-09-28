import { useState } from 'react';
import { BASE, useMeta } from '../api.ts';

const TONES = ['#2a78d6', '#1baf7a', '#eb6834', '#4a3aa7', '#008300', '#e34948', '#c98500', '#d55181'];

function initials(name: string) {
  const words = name
    .replace(/\s+\d+$/, '')
    .split(/[\s/-]+/)
    .filter((w) => w && !/^\d/.test(w) && !/^(e\.?v\.?)$/i.test(w));
  const letters = words.length > 1 ? words.slice(0, 3).map((w) => w[0]) : [name.slice(0, 2)];
  return letters.join('').toUpperCase();
}

function tone(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

export function TeamLogo({ teamId, name, size = 28 }: { teamId: number | null; name: string; size?: number }) {
  const { data: meta } = useMeta();
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  const file = teamId !== null ? meta?.logos[teamId] : undefined;
  if (!file || failed) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
        style={{ ...style, background: tone(name), fontSize: Math.max(9, size * 0.34) }}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={`${BASE}api/logos/${file}`}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-md object-contain"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
