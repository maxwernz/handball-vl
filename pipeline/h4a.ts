// Client for the handball4all (h4a) JSON service that powers the BWHV result pages.

import { H4A_BASE, H4A_ORG, leagueUrl, type Envelope, type LeagueResponse, type OrgResponse } from '../shared/h4a.ts';
import { fetchJson, fetchWithRetry } from './http.ts';

/** h4a rate-limits bursts, so keep at least this much time between requests. */
const GAP_MS = 1500;

async function getJson<T extends Envelope<unknown>>(url: string): Promise<T> {
  const data = await fetchJson<T[] | { status: number; statusText: string }>(url, {
    headers: { Referer: 'https://www.bwhv.org/' },
    gapMs: GAP_MS,
  });
  if (!Array.isArray(data)) throw new Error(`h4a: ${data.statusText}`);
  return data[0];
}

export function fetchOrg(period?: number) {
  const query = new URLSearchParams({ cmd: 'po', og: String(H4A_ORG) });
  if (period) query.set('p', String(period));
  return getJson<OrgResponse>(`${H4A_BASE}/service/if_g_json.php?${query}`);
}

export function fetchLeague(period: number, classId: number, teamId?: number) {
  return getJson<LeagueResponse>(leagueUrl(period, classId, teamId));
}

export function reportUrl(reportId: number) {
  return `${H4A_BASE}/misc/sboPublicReports.php?sGID=${reportId}`;
}

export async function fetchReportPdf(reportId: number): Promise<Uint8Array | null> {
  const res = await fetchWithRetry(reportUrl(reportId), { gapMs: GAP_MS });
  if (!res.ok || !res.headers.get('content-type')?.includes('pdf')) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchRobotext(gameId: number): Promise<{ text: string; footer: string } | null> {
  const data = await fetchJson<{ status: number; robotext?: { text: string; footer: string } }>(
    `${H4A_BASE}/service/robotext/if_robotext.php?cmd=text&game=${gameId}`,
    { gapMs: GAP_MS },
  );
  return data.status === 1 && data.robotext?.text ? data.robotext : null;
}
