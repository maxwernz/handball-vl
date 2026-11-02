import { useMemo } from 'react';
import { ZONES } from '../../../lib/model.ts';
import { pct, players, resultOf } from '../../../lib/stats.ts';
import { Columns, ZoneBars } from '../charts.tsx';
import { go, href, useTeam } from '../state.tsx';
import { Card, Empty, ResultBadge, SortTable, Tile, fmtDate, fmtNum, fmtPct, shortName, venue, type Column } from '../ui.tsx';
import { FIELD_STATS, QuoteCell } from './Players.tsx';

type Row = ReturnType<typeof players>[number]['perGame'][number];

export function PlayerView({ playerKey }: { playerKey: string }) {
  const { bundle, games, filters } = useTeam();
  const all = useMemo(() => players(games, filters.half, bundle.aliases), [games, filters.half, bundle.aliases]);
  const p = all.find((x) => x.key === playerKey);
  if (!p) {
    return (
      <Empty>
        <h2>Spieler nicht in dieser Auswahl</h2>
        <p>In den ausgewählten Spielen kommt dieser Spieler nicht vor.</p>
        <a className="btn" href={href.players}>Zur Spielerliste</a>
      </Empty>
    );
  }
  const l = p.line;
  const n = p.games;
  const teamGoals = all.reduce((a, x) => a + x.line.goals, 0);
  const keeper = l.faced > 0;
  const fieldPlayer = l.shots > 0 || !keeper;
  const seven = l.zones['7m'];

  const logColumns: Column<Row>[] = [
    { key: 'date', label: 'Datum', value: (r) => r.game.date, render: (r) => fmtDate(r.game.date), desc: true },
    { key: 'opp', label: 'Gegner', value: (r) => r.game.opponent, render: (r) => <span className="opp-cell"><ResultBadge game={r.game} /> <span>{venue(r.game)} {r.game.opponent}</span></span>, className: 'name', desc: false },
    { key: 'res', label: 'Erg.', value: (r) => r.game.goalsFor - r.game.goalsAgainst, render: (r) => `${r.game.goalsFor}:${r.game.goalsAgainst}`, className: 'num' },
    ...(fieldPlayer
      ? [
          { key: 'goals', label: 'Tore', value: (r: Row) => r.line.goals, className: 'num strong' },
          { key: 'shots', label: 'Würfe', value: (r: Row) => r.line.shots, className: 'num' },
          { key: 'q', label: 'Quote', value: (r: Row) => pct(r.line.goals, r.line.shots), render: (r: Row) => <QuoteCell v={pct(r.line.goals, r.line.shots)} />, className: 'num' },
          ...FIELD_STATS.slice(2).filter((s) => s.get(l) > 0).map((s) => ({ key: s.key, label: s.label, title: s.title, value: (r: Row) => s.get(r.line), render: (r: Row) => s.get(r.line) || <span className="muted">·</span>, className: 'num' })),
        ]
      : []),
    ...(keeper
      ? [
          { key: 'saves', label: 'Paraden', value: (r: Row) => r.line.saves, render: (r: Row) => <>{r.line.saves}<span className="muted">/{r.line.faced}</span></>, className: 'num strong' },
          { key: 'sq', label: 'Quote', value: (r: Row) => pct(r.line.saves, r.line.faced), render: (r: Row) => <QuoteCell v={pct(r.line.saves, r.line.faced)} />, className: 'num' },
        ]
      : []),
  ];

  return (
    <div className="stack">
      <div className="profile-head">
        <a href={href.players} className="back">← Spieler</a>
        <div className="profile-title">
          <span className="jersey">{p.no}</span>
          <div>
            <h1>{p.name}</h1>
            <p className="muted">
              {keeper && fieldPlayer ? 'Feldspieler & Torhüter' : keeper ? 'Torhüter' : 'Feldspieler'} · {n} {n === 1 ? 'Spiel' : 'Spiele'} in der Auswahl
              {filters.half ? ` · nur ${filters.half}. Halbzeit` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="tiles">
        {fieldPlayer && (
          <>
            <Tile accent label="Tore" value={l.goals} sub={`${fmtNum(l.goals / n)} pro Spiel`} />
            <Tile label="Wurfquote" value={fmtPct(pct(l.goals, l.shots))} sub={`${l.goals} von ${l.shots} Würfen`} />
            <Tile label="Anteil Teamtore" value={fmtPct(pct(l.goals, teamGoals))} sub={`von ${teamGoals} Toren`} />
            {seven[1] > 0 && <Tile label="7m" value={`${seven[0]}/${seven[1]}`} sub={fmtPct(pct(seven[0], seven[1]))} />}
            <Tile label="Ballgewinne" value={l.steals + l.forcedSteals} sub={`${l.fouls} Stopfouls · ${l.sevenWon} × 7m geholt`} />
            <Tile label="Ballverluste" value={l.turnovers} sub={`${fmtNum(l.turnovers / n)} pro Spiel`} />
            <Tile label="Zeitstrafen" value={l.twoMin} sub={`${l.yellow} Gelb · ${l.red} Rot · ${l.sevenCaused} × 7m verursacht`} />
          </>
        )}
        {keeper && (
          <>
            <Tile accent={!fieldPlayer} label="Paraden" value={l.saves} sub={`${fmtNum(l.saves / n)} pro Spiel`} />
            <Tile label="Paradenquote" value={fmtPct(pct(l.saves, l.faced))} sub={`${l.saves} von ${l.faced} Würfen`} />
            <Tile label="7m gehalten" value={`${l.keeperZones['7m'][0]}/${l.keeperZones['7m'][1]}`} sub={fmtPct(pct(...l.keeperZones['7m']))} />
          </>
        )}
      </div>

      <div className="grid-2">
        {fieldPlayer && (
          <Card title="Tore pro Spiel" sub="Dunkel: Tore, hell dahinter: Würfe. Klick öffnet das Spiel.">
            <Columns
              ariaLabel="Tore und Würfe pro Spiel"
              items={p.perGame.map((r) => ({
                key: r.game.id,
                label: shortName(r.game.opponent, 10),
                value: r.line.goals,
                track: r.line.shots,
                onClick: () => go(href.game(r.game.id)),
                tip: <><b>{fmtDate(r.game.date)} {venue(r.game)} {r.game.opponent}</b><br />{r.line.goals} Tore aus {r.line.shots} Würfen</>,
              }))}
            />
          </Card>
        )}
        {fieldPlayer && (
          <Card title="Wurfbild" sub="Tore / Würfe je Position">
            <ZoneBars aLabel={p.name} rows={ZONES.filter((z) => l.zones[z][1] > 0).map((z) => ({ label: z, a: l.zones[z] }))} />
            {!l.shots && <p className="muted small">Keine Würfe in dieser Auswahl.</p>}
          </Card>
        )}
        {keeper && (
          <Card title="Paradenquote pro Spiel" sub="Klick öffnet das Spiel.">
            <Columns
              percent
              ariaLabel="Paradenquote pro Spiel"
              items={p.perGame.filter((r) => r.line.faced > 0).map((r) => ({
                key: r.game.id,
                label: shortName(r.game.opponent, 10),
                value: r.line.saves / r.line.faced,
                onClick: () => go(href.game(r.game.id)),
                tip: <><b>{fmtDate(r.game.date)} {venue(r.game)} {r.game.opponent}</b><br />{r.line.saves} Paraden bei {r.line.faced} Würfen · {fmtPct(r.line.saves / r.line.faced)}</>,
              }))}
            />
          </Card>
        )}
        {keeper && (
          <Card title="Paraden je Position" sub="Gehalten / Würfe aufs Tor">
            <ZoneBars aLabel="Paraden" rows={ZONES.filter((z) => l.keeperZones[z][1] > 0).map((z) => ({ label: z, a: l.keeperZones[z] }))} />
          </Card>
        )}
      </div>

      <Card title="Spiel für Spiel" sub={`${p.perGame.filter((r) => resultOf(r.game) === 'S').length} Siege in ${n} Spielen`}>
        <SortTable rows={p.perGame} columns={logColumns} initial="date" rowKey={(r) => r.game.id} onRow={(r) => go(href.game(r.game.id))} />
      </Card>
    </div>
  );
}
