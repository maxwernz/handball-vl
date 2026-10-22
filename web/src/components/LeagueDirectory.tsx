import { Link } from 'react-router';
import type { LeagueRef, Meta } from '../../../shared/types.ts';
import { toggleFavoriteLeague, useFavoriteLeagues } from '../lib/favorites.ts';
import { Icon } from './Icon.tsx';
import { FavoriteStar } from './ui.tsx';

export function leagueCategory(league: LeagueRef) {
  return league.short.startsWith('F-') || league.name.startsWith('Frauen') ? 'Frauen' : league.short.startsWith('M-') || league.name.startsWith('Männer') ? 'Männer' : 'Weitere';
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
