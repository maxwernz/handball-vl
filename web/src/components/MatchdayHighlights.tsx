import { Link } from 'react-router';
import type { Game } from '../../../shared/types.ts';
import { useTopScorers } from '../api.ts';
import { TeamLogo } from './TeamLogo.tsx';
import { Section } from './ui.tsx';

/** The selected matchday's highlights, using only available, validated reports. */
export function MatchdayHighlights({ games, title = 'Höhepunkte der Auswahl' }: { games: Game[]; title?: string }) {
  const { data: scorers } = useTopScorers();
  const finished = games.filter((game) => game.status === 'finished' && game.homeGoals !== null && game.guestGoals !== null);
  if (!finished.length) return null;
  const best = finished.flatMap((game) => (scorers?.[game.id] ?? []).map((scorer) => ({ game, scorer }))).sort((a, b) => b.scorer.goals - a.scorer.goals).slice(0, 3);
  const highest = finished.reduce((a, b) => Math.abs(b.homeGoals! - b.guestGoals!) > Math.abs(a.homeGoals! - a.guestGoals!) ? b : a);
  return <div className="mt-7"><Section title={title}>
    <div className="border-t border-(--color-line)">
      {best.map(({ game, scorer }) => <div key={`${game.id}-${scorer.key}`} className="flex items-center gap-3 border-b border-(--color-line) py-3 text-sm">
        <TeamLogo teamId={scorer.teamId} name={scorer.team} size={28} />
        <Link to={`/spieler/${scorer.key}`} className="min-w-0 flex-1 hover:underline"><span className="block truncate font-semibold">{scorer.name}</span><span className="block truncate text-xs text-(--color-ink-3)">{scorer.team}</span></Link>
        <Link to={`/spiel/${game.id}`} className="tabular shrink-0 font-semibold hover:underline">{scorer.goals} Tore</Link>
      </div>)}
      <Link to={`/spiel/${highest.id}`} className="flex items-center justify-between gap-3 border-b border-(--color-line) py-3 text-sm hover:text-(--color-brand)">
        <span className="min-w-0"><span className="mb-1 block text-xs text-(--color-ink-3)">Höchster Sieg</span><span className="block truncate">{highest.home} – {highest.guest}</span></span>
        <span className="tabular shrink-0 font-bold">{highest.homeGoals}:{highest.guestGoals}</span>
      </Link>
    </div>
    {best.length > 0 && <p className="mt-2 text-xs text-(--color-ink-3)">Beste Torleistungen aus den bereits erfassten Spielberichten.</p>}
  </Section></div>;
}
