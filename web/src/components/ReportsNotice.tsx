import { useMeta } from '../api.ts';
import { genderLookup, type Gender } from '../lib/gender.ts';

/** Shown on statistics views while match reports of the shown league(s) are still expected. */
export function ReportsNotice({ leagueId }: { leagueId: number | Gender | null }) {
  const { data: meta } = useMeta();
  // Older cached meta files do not carry the field yet.
  const pending = meta?.pendingReports ?? {};
  const genderOf = genderLookup(meta?.leagues);
  const count = typeof leagueId === 'number' ? pending[leagueId] ?? 0
    : Object.entries(pending).filter(([id]) => leagueId === null || genderOf(Number(id)) === leagueId).reduce((sum, [, n]) => sum + n, 0);
  if (!count) return null;
  return <div className="status-notice" role="status">
    {count === 1 ? 'Für 1 Spiel fehlt' : `Für ${count} Spiele fehlen`} noch der Spielbericht. Die Statistik wird automatisch ergänzt.
  </div>;
}
