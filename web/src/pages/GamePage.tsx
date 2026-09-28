import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { GameDetail, MatchEvent, PlayerLine, Report, TeamDetail, TeamSheet } from '../../../shared/types.ts';
import { useGame, useLeague, useTeam } from '../api.ts';
import { CompareBar, ScoreFlowChart } from '../components/charts.tsx';
import { GameList } from '../components/GameRow.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Empty, ErrorBox, FormBadges, LiveBadge, Loading, Section, Tabs } from '../components/ui.tsx';
import { formatLongDay, formatTime } from '../lib/format.ts';
import { matchStats } from '../lib/matchStats.ts';
import { unitTable, type Unit, type UnitRow } from '../lib/standings.ts';
import { playerKey } from '../../../shared/players.ts';

type Tab = 'summary' | 'ticker' | 'lineups' | 'stats' | 'compare';

function Scoreboard({ data }: { data: GameDetail }) {
  const { game, league } = data;
  const played = game.status !== 'scheduled';
  const team = (id: number | null, name: string, full: string | undefined) => {
    const content = (
      <>
        <TeamLogo teamId={id} name={full ?? name} size={64} />
        <span className="mt-2 line-clamp-2 text-sm leading-tight font-semibold sm:text-base">{full ?? name}</span>
      </>
    );
    return id ? (
      <Link to={`/team/${id}`} className="flex flex-1 flex-col items-center text-center hover:underline">
        {content}
      </Link>
    ) : (
      <div className="flex flex-1 flex-col items-center text-center">{content}</div>
    );
  };
  return (
    <div className="card mb-4 overflow-hidden">
      <div className="bg-(--color-header) px-4 py-2 text-center text-xs text-white/80">
        <Link to={`/liga/${league.id}`} className="hover:underline">
          {league.name}
        </Link>
        {game.round && <> · {game.round}. Spieltag</>} · Spiel {game.no}
      </div>
      <div className="flex items-start gap-2 px-3 py-5">
        {team(game.homeId, game.home, data.report?.home.name)}
        <div className="flex w-28 shrink-0 flex-col items-center pt-3 sm:w-36">
          {game.status === 'live' && <LiveBadge />}
          <div className={`tabular mt-1 text-4xl font-extrabold sm:text-5xl ${game.status === 'live' ? 'text-(--color-live)' : ''}`}>
            {played ? `${game.homeGoals ?? 0}:${game.guestGoals ?? 0}` : formatTime(game.date)}
          </div>
          {game.status === 'finished' && game.homeGoalsHt !== null && (
            <div className="tabular text-sm text-(--color-ink-2)">
              Halbzeit {game.homeGoalsHt}:{game.guestGoalsHt}
            </div>
          )}
          {game.status === 'scheduled' && <div className="text-sm text-(--color-ink-2)">Anwurf</div>}
        </div>
        {team(game.guestId, game.guest, data.report?.guest.name)}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-(--color-line) px-4 py-2.5 text-center text-xs text-(--color-ink-2)">
        <span>
          {formatLongDay(game.date)}, {formatTime(game.date)} Uhr
        </span>
        {game.venue && (
          <a
            className="hover:underline"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${game.venue.name}, ${game.venue.street}, ${game.venue.postal} ${game.venue.town}`)}`}
          >
            📍 {game.venue.name}, {game.venue.town}
          </a>
        )}
        {data.report?.spectators != null && <span>{data.report.spectators} Zuschauer</span>}
        {data.report && data.report.referees.length > 0 && <span>SR: {data.report.referees.join(' / ')}</span>}
      </div>
      {game.comment && <div className="border-t border-(--color-line) px-4 py-2 text-center text-sm">{game.comment}</div>}
      {game.status === 'live' && (
        <div className="border-t border-(--color-line) bg-(--color-live)/10 px-4 py-2 text-center text-xs">
          Live-Spielstand – aktualisiert sich automatisch alle 20 Sekunden. Der komplette Spielverlauf erscheint mit dem Spielbericht.
        </div>
      )}
    </div>
  );
}

const EVENT_LOOK: Record<MatchEvent['type'], { icon: string; className: string; label: string }> = {
  goal: { icon: '●', className: 'text-(--color-ink)', label: 'Tor' },
  sevenGoal: { icon: '7m', className: 'text-(--color-ink)', label: '7m-Tor' },
  sevenMiss: { icon: '7m', className: 'text-(--color-ink-3) line-through', label: '7m verworfen' },
  twoMinutes: { icon: "2'", className: 'text-(--color-ink-2)', label: 'Zeitstrafe' },
  warning: { icon: '▮', className: 'text-(--color-draw)', label: 'Verwarnung' },
  disqualification: { icon: '▮', className: 'text-(--color-loss)', label: 'Disqualifikation' },
  timeout: { icon: 'T', className: 'text-(--color-ink-2)', label: 'Auszeit' },
  other: { icon: '·', className: 'text-(--color-ink-3)', label: '' },
};

function describe(e: MatchEvent) {
  switch (e.type) {
    case 'goal':
      return `Tor ${e.player}`;
    case 'sevenGoal':
      return `7m-Tor ${e.player}`;
    case 'sevenMiss':
      return `7m verworfen – ${e.player}`;
    case 'twoMinutes':
      return `2 Minuten – ${e.player}`;
    case 'warning':
      return `Gelbe Karte – ${e.player}`;
    case 'disqualification':
      return `Rote Karte – ${e.player}`;
    case 'timeout':
      return 'Team-Auszeit';
    default:
      return e.text;
  }
}

function Ticker({ report, home, guest }: { report: Report; home: string; guest: string }) {
  const [newestFirst, setNewestFirst] = useState(false);
  const events = newestFirst ? [...report.events].reverse() : report.events;
  let halftimeShown = false;
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button className="text-sm text-(--color-brand) hover:underline" onClick={() => setNewestFirst((v) => !v)}>
          {newestFirst ? 'Chronologisch sortieren' : 'Neueste zuerst'}
        </button>
      </div>
      <ol className="card divide-y divide-(--color-line) overflow-hidden">
        {events.map((e, i) => {
          const look = EVENT_LOOK[e.type];
          const isGoal = e.type === 'goal' || e.type === 'sevenGoal';
          const showHalf = !newestFirst && !halftimeShown && e.t > 1800;
          if (showHalf) halftimeShown = true;
          return (
            <li key={i}>
              {showHalf && (
                <div className="bg-(--color-surface-2) py-1.5 text-center text-xs font-semibold text-(--color-ink-2)">Halbzeit</div>
              )}
              <div className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  className="h-7 w-1 shrink-0 rounded-full"
                  style={{ background: e.side === 'home' ? 'var(--color-home)' : e.side === 'guest' ? 'var(--color-guest)' : 'var(--color-line)' }}
                />
                <span className="tabular w-9 shrink-0 text-xs text-(--color-ink-3)">{Math.floor(e.t / 60) + 1}'</span>
                <span className={`w-6 shrink-0 text-center text-xs font-bold ${look.className}`} title={look.label}>
                  {look.icon}
                </span>
                <span className={`min-w-0 flex-1 truncate ${isGoal ? 'font-medium' : 'text-(--color-ink-2)'}`}>
                  {describe(e)}
                  {e.type === 'timeout' && <span className="text-(--color-ink-3)"> · {e.side === 'home' ? home : guest}</span>}
                </span>
                {isGoal && (
                  <span className="tabular shrink-0 rounded-md bg-(--color-surface-2) px-2 py-0.5 text-xs font-bold">
                    {e.homeScore}:{e.guestScore}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Lineup({ sheet, teamId, side }: { sheet: TeamSheet; teamId: number | null; side: 'home' | 'guest' }) {
  const penalties = (p: PlayerLine) => (
    <span className="inline-flex gap-1">
      {p.warning && <span title={`Verwarnung ${p.warning}`} className="inline-block h-3.5 w-2.5 rounded-sm bg-(--color-draw)" />}
      {p.twoMinutes.map((t) => (
        <span key={t} title={`2 Minuten (${t})`} className="rounded bg-(--color-surface-2) px-1 text-[10px] font-bold">
          2'
        </span>
      ))}
      {p.disqualification && <span title={`Disqualifikation ${p.disqualification}`} className="inline-block h-3.5 w-2.5 rounded-sm bg-(--color-loss)" />}
    </span>
  );
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-(--color-line) px-3 py-2.5 font-semibold">
        <span className="h-3 w-3 rounded-full" style={{ background: side === 'home' ? 'var(--color-home)' : 'var(--color-guest)' }} />
        {sheet.name}
      </div>
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="text-xs text-(--color-ink-3)">
            <th className="w-9 py-1.5 pl-3 text-left font-medium">Nr</th>
            <th className="py-1.5 text-left font-medium">Name</th>
            <th className="px-2 py-1.5 text-right font-medium">Tore</th>
            <th className="px-2 py-1.5 text-right font-medium">7m</th>
            <th className="py-1.5 pr-3 pl-2 text-right font-medium">Strafen</th>
          </tr>
        </thead>
        <tbody>
          {sheet.players.map((p) => (
            <tr key={`${p.no}-${p.name}`} className="border-t border-(--color-line)">
              <td className="py-1.5 pl-3 text-(--color-ink-3)">{p.no}</td>
              <td className="max-w-0 truncate py-1.5">
                {p.anonymous || teamId === null ? (
                  <span className="text-(--color-ink-2)">{p.name}</span>
                ) : (
                  <Link to={`/spieler/${playerKey(teamId, p.name)}`} className="hover:underline">
                    {p.name}
                  </Link>
                )}
              </td>
              <td className={`px-2 py-1.5 text-right ${p.goals ? 'font-semibold' : 'text-(--color-ink-3)'}`}>{p.goals || '–'}</td>
              <td className="px-2 py-1.5 text-right text-(--color-ink-2)">{p.sevenAttempts ? `${p.sevenGoals}/${p.sevenAttempts}` : ''}</td>
              <td className="py-1.5 pr-3 pl-2 text-right">{penalties(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.officials.length > 0 && (
        <div className="border-t border-(--color-line) px-3 py-2 text-xs text-(--color-ink-2)">
          Offizielle: {sheet.officials.map((o) => `${o.name} (${o.no})`).join(', ')}
        </div>
      )}
    </div>
  );
}

function MatchStatsView({ report, data }: { report: Report; data: GameDetail }) {
  const { home, guest, flow } = matchStats(report);
  const minutes = (s: number) => `${Math.round(s / 60)} min`;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-2 font-semibold">Spielverlauf</h3>
        <ScoreFlowChart events={report.events} home={data.game.home} guest={data.game.guest} />
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-(--color-line) pt-3 text-center text-sm">
          <div>
            <div className="tabular text-xl font-bold">{flow.leadChanges}</div>
            <div className="text-xs text-(--color-ink-3)">Führungswechsel</div>
          </div>
          <div>
            <div className="tabular text-xl font-bold">{flow.ties}</div>
            <div className="text-xs text-(--color-ink-3)">Ausgleiche</div>
          </div>
        </div>
      </div>
      <div className="card px-4 py-2">
        <CompareBar label="Feldtore" home={home.fieldGoals} guest={guest.fieldGoals} />
        <CompareBar label="7-Meter-Tore" home={home.sevenGoals} guest={guest.sevenGoals} />
        <div className="-mt-1 mb-1 flex justify-between text-xs text-(--color-ink-3)">
          <span>{home.sevenAttempts} Versuche</span>
          <span>{guest.sevenAttempts} Versuche</span>
        </div>
        <CompareBar label="Höchste Führung" home={home.maxLead} guest={guest.maxLead} />
        <CompareBar label="Längste Torserie" home={home.longestRun} guest={guest.longestRun} />
        <CompareBar label="In Führung" home={home.timeLeading} guest={guest.timeLeading} format={minutes} />
        <CompareBar label="Tore in Überzahl" home={home.powerPlayGoals} guest={guest.powerPlayGoals} />
        <CompareBar label="Zeitstrafen" home={home.twoMinutes} guest={guest.twoMinutes} />
        <CompareBar label="Verwarnungen" home={home.warnings} guest={guest.warnings} />
        <CompareBar label="Auszeiten" home={home.timeouts} guest={guest.timeouts} />
      </div>
    </div>
  );
}

function Comparison({ homeId, guestId }: { homeId: number; guestId: number }) {
  const home = useTeam(homeId);
  const guest = useTeam(guestId);
  const { data: league } = useLeague(home.data?.league.id);
  if (home.isLoading || guest.isLoading) return <Loading />;
  if (!home.data || !guest.data) return <ErrorBox error={home.error ?? guest.error} />;
  const a = home.data;
  const b = guest.data;
  const avg = (v: number, n: number) => (n ? v / n : 0);
  const num = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const rate = (made: number, att: number) => (att ? made / att : 0);
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  const record = (r: { won: number; drawn: number; lost: number }) => `${r.won}-${r.drawn}-${r.lost}`;
  const scorer = (t: TeamDetail) => {
    const p = t.players[0];
    return p ? (
      <Link to={`/spieler/${p.key}`} className="hover:underline">
        {p.name} ({p.goals})
      </Link>
    ) : (
      '–'
    );
  };
  // Attack/defense rank in the league; the better of the two is highlighted.
  const unitRow = (label: string, unit: Unit) => {
    if (!league) return null;
    const table = unitTable(league.table, unit);
    const [x, y] = [a, b].map((t) => table.find((r) => r.teamId === t.team.id));
    const cell = (r: UnitRow | undefined, other: UnitRow | undefined) =>
      r?.perGame != null ? (
        <span className={other?.perGame != null && r.rank < other.rank ? 'text-(--color-win)' : ''}>
          {r.rank}. <span className="font-normal text-(--color-ink-2)">· {num(r.perGame)}</span>
        </span>
      ) : (
        '–'
      );
    return row(label, cell(x, y), cell(y, x));
  };
  const row = (label: string, left: React.ReactNode, right: React.ReactNode) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 text-sm">
      <span className="tabular min-w-0 truncate font-semibold">{left}</span>
      <span className="text-center text-(--color-ink-2)">{label}</span>
      <span className="tabular min-w-0 truncate text-right font-semibold">{right}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card min-w-0 divide-y divide-(--color-line) px-4 py-2">
        <div className="grid grid-cols-2 gap-3 py-2 text-sm font-semibold">
          <Link to={`/team/${homeId}`} className="flex min-w-0 items-center gap-2 hover:underline">
            <TeamLogo teamId={homeId} name={a.team.name} size={24} />
            <span className="truncate">{a.team.name}</span>
          </Link>
          <Link to={`/team/${guestId}`} className="flex min-w-0 items-center justify-end gap-2 text-right hover:underline">
            <span className="truncate">{b.team.name}</span>
            <TeamLogo teamId={guestId} name={b.team.name} size={24} />
          </Link>
        </div>
        {row('Platz', a.tableRow ? `${a.tableRow.rank}.` : '–', b.tableRow ? `${b.tableRow.rank}.` : '–')}
        {row('Punkte', a.tableRow ? `${a.tableRow.pointsPlus}:${a.tableRow.pointsMinus}` : '–', b.tableRow ? `${b.tableRow.pointsPlus}:${b.tableRow.pointsMinus}` : '–')}
        {unitRow('Angriff', 'attack')}
        {unitRow('Abwehr', 'defense')}
        {row('Form', <FormBadges form={a.stats.form} />, <span className="flex justify-end"><FormBadges form={b.stats.form} /></span>)}
        {row('Heim / Auswärts', record(a.stats.home), record(b.stats.away))}
        {row('Torschütze', scorer(a), scorer(b))}
      </div>
      <div className="card min-w-0 px-4 py-2">
        <CompareBar label="Tore pro Spiel" home={avg(a.stats.goalsFor, a.stats.played)} guest={avg(b.stats.goalsFor, b.stats.played)} format={num} />
        <CompareBar label="Gegentore pro Spiel" home={avg(a.stats.goalsAgainst, a.stats.played)} guest={avg(b.stats.goalsAgainst, b.stats.played)} format={num} />
        <CompareBar label="7-Meter-Quote" home={rate(a.stats.sevenGoals, a.stats.sevenAttempts)} guest={rate(b.stats.sevenGoals, b.stats.sevenAttempts)} format={pct} />
        <CompareBar label="Zeitstrafen pro Spiel" home={avg(a.stats.twoMinutes, a.stats.reports)} guest={avg(b.stats.twoMinutes, b.stats.reports)} format={num} />
        <CompareBar label="Spielzeit in Führung" home={rate(a.stats.timeLeading, a.stats.timeTotal)} guest={rate(b.stats.timeLeading, b.stats.timeTotal)} format={pct} />
        <CompareBar label="Knappe Spiele gewonnen" home={a.stats.close.won} guest={b.stats.close.won} />
        <p className="py-2 text-xs text-(--color-ink-3)">
          Saisonwerte: Heimbilanz von {a.team.name}, Auswärtsbilanz von {b.team.name}. Angriff/Abwehr: Platz in der Liga
          nach Toren bzw. Gegentoren pro Spiel. Knapp = höchstens 2 Tore Unterschied.
        </p>
      </div>
    </div>
  );
}

export function GamePage() {
  const id = Number(useParams().id);
  const { data, isLoading, error } = useGame(id);
  const [tab, setTab] = useState<Tab | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const { report, summary, game } = data;
  const compare = game.homeId !== null && game.guestId !== null ? [{ id: 'compare' as const, label: 'Vergleich' }] : [];
  const tabs: { id: Tab; label: string }[] = [
    ...(game.status === 'scheduled' ? compare : []),
    ...(summary ? [{ id: 'summary' as const, label: 'Bericht' }] : []),
    ...(report ? [
      { id: 'ticker' as const, label: 'Ticker' },
      { id: 'lineups' as const, label: 'Aufstellung' },
      { id: 'stats' as const, label: 'Statistik' },
    ] : []),
    ...(game.status !== 'scheduled' ? compare : []),
  ];
  const active = tab ?? tabs[0]?.id;

  return (
    <div>
      <Scoreboard data={data} />
      {tabs.length > 0 && <Tabs tabs={tabs} value={active!} onChange={setTab} />}

      {active === 'summary' && summary && (
        <article className="card p-4 sm:p-6">
          <h2 className="mb-3 text-lg leading-snug font-bold">{summary.title}</h2>
          <div className="summary text-[15px]" dangerouslySetInnerHTML={{ __html: summary.html }} />
          <p className="mt-2 text-xs text-(--color-ink-3)">Automatisch erstellter Spielbericht (handball4all).</p>
        </article>
      )}
      {active === 'ticker' && report && <Ticker report={report} home={data.game.home} guest={data.game.guest} />}
      {active === 'lineups' && report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Lineup sheet={report.home} teamId={data.game.homeId} side="home" />
          <Lineup sheet={report.guest} teamId={data.game.guestId} side="guest" />
        </div>
      )}
      {active === 'stats' && report && <MatchStatsView report={report} data={data} />}
      {active === 'compare' && game.homeId !== null && game.guestId !== null && <Comparison homeId={game.homeId} guestId={game.guestId} />}

      {data.game.status === 'finished' && !report && (
        <Empty>Der Spielbericht ist noch nicht verfügbar – er wird automatisch geladen, sobald h4a ihn veröffentlicht.</Empty>
      )}

      {data.previous.length > 0 && (
        <div className="mt-6">
          <Section title="Weitere Duelle dieser Saison">
            <GameList games={data.previous} />
          </Section>
        </div>
      )}

      {data.reportUrl && (
        <div className="mt-4 text-center">
          <a href={data.reportUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-(--color-brand) hover:underline">
            Original-Spielbericht (PDF) öffnen ↗
          </a>
        </div>
      )}
    </div>
  );
}
