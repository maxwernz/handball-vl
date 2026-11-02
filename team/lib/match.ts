// Finds the h4a game that an upload belongs to: same team, same final score from our
// point of view, opponent name as tie breaker. Uses the public JSON API of the site.

import type { StatGame } from './model.ts';
import { slug } from './game.ts';

interface ApiGame {
  id: number;
  no: string;
  leagueId: number;
  date: string;
  homeId: number;
  guestId: number;
  home: string;
  guest: string;
  homeGoals: number | null;
  guestGoals: number | null;
  status: string;
}

export interface Candidate {
  meta: Pick<StatGame, 'id' | 'h4a' | 'date' | 'opponent' | 'home'>;
  goalsFor: number | null;
  goalsAgainst: number | null;
  /** Final score matches the upload. */
  scoreMatch: boolean;
  /** 0–1, how well the opponent name matches. */
  nameMatch: number;
}

type Load = <T>(path: string) => Promise<T>;

function similarity(a: string, b: string) {
  const x = slug(a), y = slug(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.8;
  const tx = new Set(x.split('-')), ty = y.split('-');
  return ty.filter((t) => tx.has(t)).length / Math.max(tx.size, ty.length);
}

/** All games of our team (newest season first), ranked against the parsed upload. */
export async function candidates(load: Load, team: string, upload: { opponent: string; goalsFor: number; goalsAgainst: number }): Promise<Candidate[]> {
  const index = await load<{ seasons: { id: number; name: string }[] }>('index');
  const out: Candidate[] = [];
  for (const season of [...index.seasons].sort((a, b) => b.id - a.id)) {
    const meta = await load<{ teams: { id: number; name: string; leagueId: number }[]; leagues: { id: number; short: string; name: string }[] }>(`s/${season.id}/meta`);
    const names = new Map(meta.teams.map((t) => [t.id, t.name]));
    for (const t of meta.teams.filter((t) => t.name === team)) {
      const detail = await load<{ games: ApiGame[]; league: { short: string } }>(`s/${season.id}/team/${t.id}`);
      for (const g of detail.games) {
        const home = g.homeId === t.id;
        const gf = home ? g.homeGoals : g.guestGoals;
        const ga = home ? g.guestGoals : g.homeGoals;
        const oppId = home ? g.guestId : g.homeId;
        const opponent = names.get(oppId) ?? (home ? g.guest : g.home);
        const short = home ? g.guest : g.home;
        out.push({
          meta: {
            id: String(g.id),
            h4a: { gameId: g.id, no: g.no, leagueId: g.leagueId, seasonId: season.id, league: detail.league.short },
            date: g.date,
            opponent,
            home,
          },
          goalsFor: gf,
          goalsAgainst: ga,
          scoreMatch: gf === upload.goalsFor && ga === upload.goalsAgainst,
          nameMatch: Math.max(similarity(upload.opponent, opponent), similarity(upload.opponent, short)),
        });
      }
    }
    // Older seasons only matter when the current one has no fitting game.
    if (out.some((c) => c.scoreMatch)) break;
  }
  return out.sort((a, b) => Number(b.scoreMatch) - Number(a.scoreMatch) || b.nameMatch - a.nameMatch || b.meta.date.localeCompare(a.meta.date));
}

/** The candidate to preselect, if one is unambiguous. */
export function bestCandidate(list: Candidate[]) {
  const fits = list.filter((c) => c.scoreMatch);
  if (fits.length === 1) return fits[0];
  const named = fits.filter((c) => c.nameMatch >= 0.5);
  return named.length === 1 ? named[0] : null;
}
