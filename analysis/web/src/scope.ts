// Global filters → SQL fragments. Values come from fixed option lists or ids and are escaped anyway.
import { sqlText } from './db.ts';

export interface Filters { season: number; gender: string; level: string; league: number; team: number }

export const LEVELS: Record<string, string> = { RL: 'Regionalliga', OL: 'Oberliga', VL: 'Verbandsliga', LL: 'Landesliga' };

/** Forfeits, cancelled and abandoned games keep a result but say nothing about play. */
export const PLAYED = `(g.comment IS NULL OR (g.comment NOT LIKE '%(2:0)%' AND g.comment NOT LIKE '%(0:2)%' AND g.comment NOT LIKE '%Absage%' AND g.comment NOT LIKE '%abgebrochen%' AND g.comment NOT LIKE '%Wertung%'))`;

export function leagueWhere(f: Filters, l = 'l') {
  const parts = [`${l}.season_id = ${Number(f.season)}`];
  if (f.gender) parts.push(`${l}.gender = ${sqlText(f.gender)}`);
  if (f.level) parts.push(`${l}.level = ${sqlText(f.level)}`);
  if (f.league) parts.push(`${l}.id = ${Number(f.league)}`);
  return parts.join(' AND ');
}

/** Finished, regularly played games in scope (alias g). With `teamOnly`, only games of the selected team. */
export function gamesInScope(f: Filters, teamOnly = true) {
  const team = teamOnly && f.team ? ` AND (g.home_id = ${Number(f.team)} OR g.guest_id = ${Number(f.team)})` : '';
  return `SELECT g.* FROM games g JOIN leagues l ON l.id = g.league_id
    WHERE g.status = 'finished' AND g.home_goals IS NOT NULL AND ${PLAYED} AND ${leagueWhere(f)}${team}`;
}

export function describeScope(f: Filters, leagues: { id: number; name: string }[], teams: { id: number; name: string }[]) {
  const parts = [f.gender || 'Frauen + Männer', f.level ? LEVELS[f.level] : 'alle Spielklassen'];
  if (f.league) parts.push(leagues.find((l) => l.id === f.league)?.name ?? '');
  if (f.team) parts.push(teams.find((t) => t.id === f.team)?.name ?? '');
  return parts.join(' · ');
}
