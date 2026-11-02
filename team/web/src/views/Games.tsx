import { pct, summarize } from '../../../lib/stats.ts';
import { href, useTeam } from '../state.tsx';
import { Empty, ResultBadge, fmtDate, fmtPct, venue } from '../ui.tsx';

export function GamesView() {
  const { games, filters } = useTeam();
  if (!games.length) return <Empty><h2>Keine Spiele in dieser Auswahl</h2></Empty>;
  const list = [...games].reverse().map((g) => summarize(g, filters.half));
  return (
    <div className="game-grid">
      {list.map((s) => {
        const g = s.game;
        return (
          <a key={g.id} href={href.game(g.id)} className="game-card">
            <div className="game-card-top">
              <span className="muted">{fmtDate(g.date)}{g.h4a ? ` · ${g.h4a.league}` : ''}{g.note ? ` · ${g.note}` : ''}</span>
              <ResultBadge game={g} />
            </div>
            <div className="game-card-opp">
              <span className="venue">{venue(g)}</span> {g.opponent}
            </div>
            <div className="game-card-score">
              <span className="big">{g.goalsFor}:{g.goalsAgainst}</span>
              <span className="muted">HZ {g.htFor}:{g.htAgainst}</span>
            </div>
            <dl className="game-card-stats">
              <div><dt>Wurfquote</dt><dd>{fmtPct(pct(s.team.goals, s.team.shots))}</dd></div>
              <div><dt>Paraden</dt><dd>{fmtPct(pct(s.team.saves, s.team.faced))}</dd></div>
              <div><dt>BV</dt><dd>{s.team.turnovers}</dd></div>
              <div><dt>2'</dt><dd>{s.team.twoMin}</dd></div>
            </dl>
          </a>
        );
      })}
    </div>
  );
}
