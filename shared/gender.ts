/** Men's and women's competitions are kept apart everywhere: rankings and records never mix them. */
export type Gender = 'M' | 'F';

export const GENDER_LABEL: Record<Gender, string> = { M: 'Männer', F: 'Frauen' };

/** From the h4a short name ("M-VL-4-BW", "F-OL-1-BW") or, as a fallback, the league name. */
export function leagueGender(league: { short: string; name?: string }): Gender | null {
  if (/^M-/.test(league.short) || league.name?.startsWith('Männer')) return 'M';
  if (/^F-/.test(league.short) || league.name?.startsWith('Frauen')) return 'F';
  return null;
}
