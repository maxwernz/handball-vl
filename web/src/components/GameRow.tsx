import { Link } from 'react-router';
import type { Game } from '../../../shared/types.ts';
import { useFavoriteTeamIds } from '../lib/favorites.ts';
import { formatDay, formatTime } from '../lib/format.ts';
import { TeamLogo } from './TeamLogo.tsx';
import { LiveBadge } from './ui.tsx';

function outcomeFor(game: Game, teamId: number | undefined) {
  if (teamId === undefined || game.status !== 'finished') return null;
  const home = game.homeId === teamId;
  const own = home ? game.homeGoals! : game.guestGoals!;
  const other = home ? game.guestGoals! : game.homeGoals!;
  return own > other ? 'W' : own < other ? 'L' : 'D';
}

/** One game as a compact, tappable row: date · home · score · guest. */
export function GameRow({
  game,
  showDate = true,
  perspective,
  leagueTag,
  favorites,
}: {
  game: Game;
  showDate?: boolean;
  perspective?: number;
  leagueTag?: string;
  favorites?: Set<number>;
}) {
  const outcome = outcomeFor(game, perspective);
  // Favorite teams stand out, except on their own team page where every row is theirs.
  const fav = (id: number | null) => id !== null && id !== perspective && !!favorites?.has(id);
  const nameClass = (id: number | null, won: boolean) => `${won || fav(id) ? 'font-semibold' : ''} ${fav(id) ? 'text-(--color-brand)' : ''}`;
  const scoreColor = { W: 'bg-(--color-win)', D: 'bg-(--color-draw)', L: 'bg-(--color-loss)' };
  const played = game.status !== 'scheduled';
  const homeWon = game.status === 'finished' && game.homeGoals! > game.guestGoals!;
  const guestWon = game.status === 'finished' && game.guestGoals! > game.homeGoals!;
  const scoreBox = `tabular rounded-lg text-sm font-bold ${outcome ? `${scoreColor[outcome]} text-white` : played ? 'bg-(--color-surface-2)' : 'text-(--color-ink-3)'} ${game.status === 'live' ? 'text-(--color-live)' : ''}`;
  const meta = (
    <>
      {showDate && <div>{formatDay(game.date)}</div>}
      <div>{game.status === 'live' ? <LiveBadge small /> : formatTime(game.date)}</div>
      {leagueTag && <div className="mt-0.5 font-medium text-(--color-ink-2)">{leagueTag}</div>}
    </>
  );
  return (
    <Link to={`/spiel/${game.id}`} className="block transition hover:bg-(--color-surface-2)">
      {/* Phones: teams stacked, so full names fit. */}
      <div className="flex items-center gap-3 px-3 py-2.5 sm:hidden">
        <div className="w-14 shrink-0 text-xs leading-tight text-(--color-ink-3)">{meta}</div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {([['home', game.home, game.homeId, homeWon, game.homeGoals], ['guest', game.guest, game.guestId, guestWon, game.guestGoals]] as const).map(
            ([side, name, id, won, goals]) => (
              <div key={side} className="flex items-center gap-2">
                <TeamLogo teamId={id} name={name} size={22} />
                <span className={`min-w-0 flex-1 truncate text-sm ${nameClass(id, won)}`}>{name}</span>
                <span className={`tabular w-6 text-right text-sm ${won ? 'font-bold' : played ? 'text-(--color-ink-2)' : 'text-(--color-ink-3)'}`}>
                  {played ? (goals ?? 0) : '–'}
                </span>
              </div>
            ),
          )}
        </div>
        {outcome && <span className={`${scoreBox} w-7 py-1 text-center text-xs`}>{{ W: 'S', D: 'U', L: 'N' }[outcome]}</span>}
      </div>
      {/* Wider screens: classic one-line fixture. */}
      <div className="hidden items-center gap-3 px-4 py-2.5 sm:flex">
        <div className="w-20 shrink-0 text-xs leading-tight text-(--color-ink-3)">{meta}</div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          <span className={`truncate text-sm ${nameClass(game.homeId, homeWon)}`}>{game.home}</span>
          <TeamLogo teamId={game.homeId} name={game.home} size={24} />
        </div>
        <div className={`${scoreBox} flex w-16 shrink-0 flex-col items-center justify-center py-1`}>
          {played ? `${game.homeGoals ?? 0}:${game.guestGoals ?? 0}` : '–:–'}
          {game.status === 'finished' && game.homeGoalsHt !== null && (
            <span className={`text-[10px] font-normal ${outcome ? 'text-white/80' : 'text-(--color-ink-3)'}`}>
              ({game.homeGoalsHt}:{game.guestGoalsHt})
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamLogo teamId={game.guestId} name={game.guest} size={24} />
          <span className={`truncate text-sm ${nameClass(game.guestId, guestWon)}`}>{game.guest}</span>
        </div>
      </div>
    </Link>
  );
}

export function GameList({ games, ...props }: { games: Game[]; showDate?: boolean; perspective?: number; leagueTag?: (g: Game) => string }) {
  const { leagueTag, ...rest } = props;
  const favorites = useFavoriteTeamIds();
  return (
    <div className="card divide-y divide-(--color-line) overflow-hidden">
      {games.map((g) => (
        <GameRow key={g.id} game={g} {...rest} leagueTag={leagueTag?.(g)} favorites={favorites} />
      ))}
    </div>
  );
}
