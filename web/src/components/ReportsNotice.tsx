import { useMeta } from '../api.ts';

/** Shown on statistics views while match reports of the shown league(s) are still expected. */
export function ReportsNotice({ leagueId }: { leagueId: number | null }) {
  const { data: meta } = useMeta();
  // Older cached meta files do not carry the field yet.
  const pending = meta?.pendingReports ?? {};
  const count = leagueId === null ? Object.values(pending).reduce((sum, n) => sum + n, 0) : pending[leagueId] ?? 0;
  if (!count) return null;
  return <div className="status-notice" role="status">
    {count === 1 ? 'Für 1 Spiel fehlt' : `Für ${count} Spiele fehlen`} noch der Spielbericht. Die Statistik wird automatisch ergänzt.
  </div>;
}
