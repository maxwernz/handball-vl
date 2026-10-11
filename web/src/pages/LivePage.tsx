import { useRef } from 'react';
import { Link } from 'react-router';
import type { Game, MatchEvent } from '../../../shared/types.ts';
import { useLiveGames } from '../api.ts';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Empty, LiveBadge, Section, TextLink, useChanges } from '../components/ui.tsx';
import { colorStyle, useTeamColors } from '../lib/colors.ts';
import { formatTime } from '../lib/format.ts';
import { liveScore, useConference, type LiveGame } from '../lib/liveTicker.ts';

/** Break between the halves, to place events of different games on one time line. */
const HALFTIME_MS = 15 * 60_000;

function ScoreCard({ game, ticker }: { game: Game; ticker: LiveGame | undefined }) {
  const score = liveScore(game, ticker) ?? game;
  const live = game.status === 'live';
  const goals = useChanges(`${score.homeGoals}:${score.guestGoals}`);
  const team = (id: number | null, name: string, value: number | null) => (
    <div className="flex items-center gap-2">
      <TeamLogo teamId={id} name={name} size={24} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <span key={goals} className={`tabular inline-block text-lg font-bold ${live ? 'text-(--color-live)' : 'text-(--color-ink-3)'} ${goals ? 'goal-flash' : ''}`}>
        {live ? (value ?? 0) : '–'}
      </span>
    </div>
  );
  return (
    <Link to={`/spiel/${game.id}`} className="card block p-3 transition hover:border-(--color-brand)">
      <div className="mb-2 flex items-center justify-between text-xs text-(--color-ink-3)">
        {live ? <LiveBadge small /> : <span>Anwurf {formatTime(game.date)} Uhr</span>}
        <span>{'phase' in score ? score.phase : live ? '' : 'gleich'}</span>
      </div>
      <div className="space-y-1.5">
        {team(game.homeId, game.home, score.homeGoals)}
        {team(game.guestId, game.guest, score.guestGoals)}
      </div>
    </Link>
  );
}

interface FeedItem {
  key: string;
  game: Game;
  event: MatchEvent;
  /** Roughly when it happened, to order events across games. */
  at: number;
}

function FeedRow({ game, event: e, fresh }: { game: Game; event: MatchEvent; fresh: boolean }) {
  const colors = useTeamColors(game.homeId, game.guestId);
  return (
    <li className={fresh ? 'ticker-in' : ''} style={colorStyle(colors)}>
      <Link to={`/spiel/${game.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-(--color-surface-2)">
        <span
          className="h-9 w-1 shrink-0 rounded-full"
          style={{ background: e.side === 'home' ? 'var(--color-home)' : e.side === 'guest' ? 'var(--color-guest)' : 'var(--color-line)' }}
        />
        <span className="tabular w-8 shrink-0 text-xs text-(--color-ink-3)">{Math.floor(e.t / 60) + 1}'</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {e.type === 'disqualification' ? 'Rote Karte' : e.type === 'sevenGoal' ? '7m-Tor' : 'Tor'} {e.player}
          </span>
          <span className="block truncate text-xs text-(--color-ink-3)">
            {game.home} – {game.guest}
          </span>
        </span>
        <span className="tabular shrink-0 rounded-md bg-(--color-surface-2) px-2 py-0.5 text-xs font-bold">
          {e.homeScore}:{e.guestScore}
        </span>
      </Link>
    </li>
  );
}

const FEED_TYPES: MatchEvent['type'][] = ['goal', 'sevenGoal', 'disqualification'];
const FEED_LENGTH = 60;

function Feed({ games, tickers }: { games: Game[]; tickers: Map<number, LiveGame> }) {
  const items: FeedItem[] = games
    .flatMap((game) =>
      (tickers.get(game.id)?.events ?? []).map((event, i) => ({
        key: `${game.id}-${i}`,
        game,
        event,
        at: game.ts + event.t * 1000 + (event.t > 1800 ? HALFTIME_MS : 0),
      })),
    )
    .filter((item) => FEED_TYPES.includes(item.event.type))
    .sort((a, b) => b.at - a.at)
    .slice(0, FEED_LENGTH);
  // Whatever was there when the page opened is old news; later entries drop in.
  const initial = useRef<Set<string> | null>(null);
  if (!initial.current && items.length) initial.current = new Set(items.map((i) => i.key));
  if (!items.length) return <Empty>Noch keine Tore – oder für die laufenden Spiele wird kein Ticker geführt.</Empty>;
  return (
    <ol className="card divide-y divide-(--color-line) overflow-hidden">
      {items.map(({ key, game, event }) => (
        <FeedRow key={key} game={game} event={event} fresh={!initial.current?.has(key)} />
      ))}
    </ol>
  );
}

/** All running games side by side, with the goals of all of them in one ticker. */
export function LivePage() {
  const games = useLiveGames();
  const running = games.filter((g) => g.status === 'live');
  const tickers = useConference(running) ?? new Map<number, LiveGame>();
  if (!games.length) {
    return (
      <Empty>
        Gerade läuft kein Spiel. <TextLink to="/">Zum Spielplan</TextLink>
      </Empty>
    );
  }
  return (
    <div className="grid gap-x-6 lg:grid-cols-2">
      <Section title={running.length ? `${running.length} ${running.length === 1 ? 'Spiel läuft' : 'Spiele laufen'}` : 'Gleich geht es los'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <ScoreCard key={g.id} game={g} ticker={tickers.get(g.id)} />
          ))}
        </div>
      </Section>
      {running.length > 0 && (
        <Section title="Alle Tore">
          <Feed games={running} tickers={tickers} />
          <p className="mt-2 px-1 text-xs text-(--color-ink-3)">
            Aus den h4a-Tickern der laufenden Spiele; die Reihenfolge zwischen den Spielen ist ungefähr.
          </p>
        </Section>
      )}
    </div>
  );
}
