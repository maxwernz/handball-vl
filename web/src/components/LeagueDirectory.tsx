import { Link } from 'react-router';
import type { LeagueRef, Meta } from '../../../shared/types.ts';
import { leagueLabel } from '../lib/format.ts';
import { GENDER_LABEL, leagueGender } from '../lib/gender.ts';
import { toggleFavoriteLeague, useFavoriteLeagues, useRecentLeagues } from '../lib/favorites.ts';
import { Icon } from './Icon.tsx';
import { FavoriteStar } from './ui.tsx';

export function leagueCategory(league: LeagueRef) {
  const gender = leagueGender(league);
  return gender ? GENDER_LABEL[gender] : 'Weitere';
}

export function LeagueDirectory({ leagues, teams, stars = true }: { leagues: LeagueRef[]; teams: Meta['teams']; stars?: boolean }) {
  const favorites = useFavoriteLeagues();
  return <div className="league-list">{leagues.map((league) => {
    const count = teams.filter((team) => team.leagueId === league.id).length;
    return <div key={league.id} className="league-directory-row">
      <Link to={`/liga/${league.id}`}>
        <span className="league-symbol"><Icon name="leagues" size={19} /></span>
        <span className="min-w-0 flex-1"><span className="league-directory-title block">{league.name}</span><span className="league-directory-meta block">{count > 0 ? `${count} Teams · ` : ''}Tabelle & Spielplan</span></span>
        {!stars && <Icon name="chevron-right" size={15} className="text-(--color-ink-3)" />}
      </Link>
      {stars && <FavoriteStar on={favorites.includes(league.short)} onClick={() => toggleFavoriteLeague(league.short)} />}
    </div>;
  })}</div>;
}

/** One tap to the table of favorite and recently opened leagues. */
export function LeagueShortcuts({ leagues, all = true }: { leagues: LeagueRef[]; all?: boolean }) {
  const favorites = useFavoriteLeagues();
  const recent = useRecentLeagues();
  const shorts = [...new Set([...favorites, ...recent])];
  const list = shorts.flatMap((short) => leagues.filter((league) => league.short === short)).slice(0, 8);
  if (!list.length && !all) return null;
  return <nav className="league-shortcuts scrollbar-none" aria-label="Schnellzugriff Ligen">
    {list.map((league) => <Link key={league.id} to={`/liga/${league.id}`} className="league-shortcut" title={league.name}>
      {favorites.includes(league.short) ? <Icon name="star" size={13} /> : <Icon name="leagues" size={13} />}{leagueLabel(league.short)}
    </Link>)}
    {all && <Link to="/ligen" className="league-shortcut is-muted">{list.length ? 'Alle Ligen' : 'Tabellen aller Ligen'}<Icon name="arrow" size={13} /></Link>}
  </nav>;
}
