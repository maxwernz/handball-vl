import { useMemo, useState } from 'react';
import { ZONES, type EventKind } from '../../../lib/model.ts';
import { inHalf, leadSeries, pct, players, summarize, type Half } from '../../../lib/stats.ts';
import { CompareRow, LeadChart, ZoneBars } from '../charts.tsx';
import { go, href, useTeam } from '../state.tsx';
import { CONFIG, SITE } from '../data.ts';
import { Card, Empty, Glossary, Legend, ResultBadge, Segmented, fmtClock, fmtDate, fmtPct } from '../ui.tsx';
import { FieldTable, GLOSSARY, KeeperTable } from './Players.tsx';

const KINDS: [string, string, EventKind[]][] = [
  ['all', 'Alle', []],
  ['shots', 'Würfe', ['goal', 'miss']],
  ['keeper', 'Torhüter', ['save', 'conceded']],
  ['ball', 'Ballgewinn/-verlust', ['steal', 'forcedSteal', 'turnover']],
  ['disc', 'Strafen & Fouls', ['twoMin', 'yellow', 'red', 'foul', 'sevenCaused']],
];

export function GameView({ id }: { id: string }) {
  const { bundle } = useTeam();
  const [half, setHalf] = useState<Half>(0);
  const [kind, setKind] = useState('all');
  const [who, setWho] = useState('');
  const [all, setAll] = useState(false);
  const game = bundle.games.find((g) => g.id === id);
  const s = useMemo(() => (game ? summarize(game, half) : null), [game, half]);
  const list = useMemo(() => (game ? players([game], half, bundle.aliases) : []), [game, half, bundle.aliases]);
  if (!game || !s) return <Empty><h2>Spiel nicht gefunden</h2><a className="btn" href={href.games}>Zu den Spielen</a></Empty>;

  const t = s.team;
  const oppShots = t.faced;
  const oppGoals = t.faced - t.saves;
  const us = CONFIG.team, them = game.opponent;
  const [left, right] = game.home === false ? [them, us] : [us, them];
  const [lg, rg] = game.home === false ? [game.goalsAgainst, game.goalsFor] : [game.goalsFor, game.goalsAgainst];
  const [lh, rh] = game.home === false ? [game.htAgainst, game.htFor] : [game.htFor, game.htAgainst];
  const filterKinds = KINDS.find((k) => k[0] === kind)![2];
  const events = game.events.filter((e) => inHalf(e.t, half) && (!filterKinds.length || filterKinds.includes(e.kind)) && (!who || e.name === who));
  const names = [...new Set(game.events.map((e) => e.name))].sort();

  return (
    <div className="stack">
      <a href={href.games} className="back">← Spiele</a>
      <section className="scoreboard">
        <div className="scoreboard-meta">
          {fmtDate(game.date)}{game.date.slice(11, 16) && game.date.slice(11, 16) !== '00:00' ? `, ${game.date.slice(11, 16)} Uhr` : ''}
          {game.h4a ? ` · ${game.h4a.league}` : ''}{game.note ? ` · ${game.note}` : ''}
        </div>
        <div className="scoreboard-main">
          <span className={`sb-team${left === us ? ' us' : ''}`}>{left}</span>
          <span className="sb-score">{lg}<span>:</span>{rg}</span>
          <span className={`sb-team right${right === us ? ' us' : ''}`}>{right}</span>
        </div>
        <div className="scoreboard-meta">
          Halbzeit {lh}:{rh} · <ResultBadge game={game} />
          {game.h4a && <> · <a href={`${SITE}spiel/${game.h4a.gameId}`}>Spielbericht</a></>}
        </div>
      </section>

      {game.warnings.length > 0 && (
        <details className="notice">
          <summary>{game.warnings.length} Hinweis{game.warnings.length > 1 ? 'e' : ''} zu den Daten</summary>
          <ul>{game.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      <div className="toolbar">
        <Segmented label="Halbzeit" value={half} onChange={setHalf} options={[[0, 'Gesamt'], [1, '1. Halbzeit'], [2, '2. Halbzeit']]} />
      </div>

      <Card title="Spielverlauf" sub={`Tordifferenz über die Spielzeit. Längster Lauf: ${s.longestRun.for} Tore in Folge für uns, ${s.longestRun.against} für den Gegner${half ? ` (${half}. Halbzeit)` : ''}.`} actions={<Legend items={[['we', 'Führung'], ['opp', 'Rückstand']]} />}>
        <LeadChart points={leadSeries(game)} height={260} />
      </Card>

      <div className="grid-2">
        <Card title="Teamvergleich" sub={half ? `${half}. Halbzeit` : 'Ganzes Spiel'} actions={<Legend items={[['we', 'Wir'], ['opp', them]]} />}>
          <div className="compare">
            <CompareRow label="Tore" a={s.for} b={s.against} />
            <CompareRow label="Würfe" a={t.shots} b={oppShots} />
            <CompareRow label="Wurfquote" a={pct(t.goals, t.shots) ?? 0} b={pct(oppGoals, oppShots) ?? 0} format={(v) => fmtPct(v)} />
            <CompareRow label="Paraden" a={t.saves} b={t.shots - t.goals} />
            <CompareRow label="7m-Tore" a={t.zones['7m'][0]} b={s.oppZones['7m'][0]} />
            <CompareRow label="Gegenstoßtore" a={t.zones['Gegenstoß'][0]} b={s.oppZones['Gegenstoß'][0]} />
          </div>
          <p className="muted small">Gegnerwerte stammen aus unseren Torhüter-Aktionen. „Paraden“ beim Gegner = unsere Fehlwürfe.</p>
        </Card>
        <Card title="Wurfbild" sub="Trefferquote je Position" actions={<Legend items={[['we', 'Wir'], ['opp', 'Gegner']]} />}>
          <ZoneBars aLabel="Wir" bLabel="Gegner" rows={ZONES.map((z) => ({ label: z, a: t.zones[z], b: s.oppZones[z] }))} />
        </Card>
      </div>

      <Card title="Spieler" sub="Klick öffnet das Spielerprofil.">
        <FieldTable list={list.filter((p) => p.line.shots > 0 || p.line.faced === 0)} mode="sum" onRow={(p) => go(href.player(p.key))} />
        {list.some((p) => p.line.faced > 0) && (
          <div className="mt">
            <KeeperTable list={list.filter((p) => p.line.faced > 0)} onRow={(p) => go(href.player(p.key))} />
          </div>
        )}
        <Glossary items={GLOSSARY} />
      </Card>

      <Card
        title="Aktionen"
        sub={`${events.length} von ${game.events.length} Einträgen`}
        actions={
          <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Spieler filtern">
            <option value="">Alle Spieler</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        }
      >
        <div className="chips mb">
          {KINDS.map(([k, label]) => (
            <button key={k} className={`chip${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table events">
            <thead>
              <tr><th className="num">Zeit</th><th className="num">Stand</th><th className="name">Spieler</th><th>Aktion</th></tr>
            </thead>
            <tbody>
              {(all ? events : events.slice(0, 25)).map((e, i) => (
                <tr key={i} className={`ev-${e.kind}`}>
                  <td className="num muted">{fmtClock(e.t)}</td>
                  <td className="num">{e.for}:{e.against}</td>
                  <td className="name"><span className="no">{e.no}</span> {e.name}</td>
                  <td><span className={`ev-tag ev-tag-${e.kind}`}>{e.action}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!all && events.length > 25 && (
          <div className="show-more"><button className="btn" onClick={() => setAll(true)}>Alle {events.length} Aktionen anzeigen</button></div>
        )}
      </Card>
    </div>
  );
}
